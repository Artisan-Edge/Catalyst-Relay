// Run ATC on objects, packages and/or transports: start a background run, poll it, read its worklist

import type { AsyncResult, Result } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { AdtRequestor } from '../types';
import { objectUri, requireConfig } from '../helpers';
import type { AtcRunOptions, AtcRunProgress, AtcRunResult } from './types';
import { getAtcCustomizing } from './getAtcCustomizing';
import { startAtcRun } from './startAtcRun';
import { getAtcRunStatus } from './getAtcRunStatus';
import { getAtcWorklist } from './getAtcWorklist';
import { summarizeAtc } from './parseAtcWorklist';

const PACKAGES_ROOT = '/sap/bc/adt/packages';
const TRANSPORTS_ROOT = '/sap/bc/adt/cts/transportrequests';
// One CDS view takes ~20 s; a transport of 25 large generated classes took ~13 minutes
const DEFAULT_TIMEOUT_MS = 30 * 60_000;
const DEFAULT_POLL_INTERVAL_MS = 3_000;
const MS_PER_MINUTE = 60_000;

// Check objects with ATC the way a transport release does. summary.releasable is false when any
// finding blocks transport release (SAP's effectOnTransports; on public cloud errors and warnings do).
export async function runAtc(client: AdtRequestor, options: AtcRunOptions): AsyncResult<AtcRunResult, Error> {
    const [uris, urisErr] = targetUris(options);
    if (urisErr) return err(urisErr);
    if (uris.length === 0) return err(new Error('No objects, packages or transports to check'));

    // The system's variant is what transport release checks with
    let checkVariant = options.checkVariant;
    if (!checkVariant) {
        const [customizing, customizingErr] = await getAtcCustomizing(client);
        if (customizingErr) return err(customizingErr);
        if (!customizing.systemCheckVariant) return err(new Error('The system names no ATC check variant: pass one explicitly'));
        checkVariant = customizing.systemCheckVariant;
    }

    const [run, startErr] = await startAtcRun(client, checkVariant, uris);
    if (startErr) return err(startErr);

    const [, waitErr] = await waitForRun(client, run.runUri, run.worklistId, options);
    if (waitErr) return err(waitErr);

    const [objects, worklistErr] = await getAtcWorklist(client, run.worklistId, options.includeExempted ?? false);
    if (worklistErr) return err(worklistErr);

    return ok({ checkVariant, worklistId: run.worklistId, objects, summary: summarizeAtc(objects) });
}

function targetUris(options: AtcRunOptions): Result<string[], Error> {
    const uris: string[] = [];
    for (const object of options.objects ?? []) {
        const [config, configErr] = requireConfig(object.extension);
        if (configErr) return err(configErr);
        const [uri, uriErr] = objectUri(config, object);
        if (uriErr) return err(uriErr);
        uris.push(uri);
    }
    for (const pkg of options.packages ?? []) uris.push(`${PACKAGES_ROOT}/${encodeURIComponent(pkg.toLowerCase())}`);
    for (const transport of options.transports ?? []) uris.push(`${TRANSPORTS_ROOT}/${encodeURIComponent(transport.toUpperCase())}`);
    return ok(uris);
}

async function waitForRun(client: AdtRequestor, runUri: string, worklistId: string, options: AtcRunOptions): AsyncResult<void, Error> {
    const timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;
    const pollInterval = options.pollInterval ?? DEFAULT_POLL_INTERVAL_MS;
    const deadline = Date.now() + timeout;
    let last: AtcRunProgress | null = null;

    for (;;) {
        const [status, statusErr] = await getAtcRunStatus(client, runUri);
        if (statusErr) return err(statusErr);

        if (!last || !sameProgress(last, status.progress)) options.onProgress?.(status.progress);
        last = status.progress;

        if (status.state === 'completed') return ok(undefined);
        if (status.state === 'failed') return err(new Error(`ATC run ended with status '${status.progress.status}': ${status.progress.description}`));
        if (Date.now() + pollInterval > deadline) {
            const minutes = Math.round(timeout / MS_PER_MINUTE * 10) / 10;
            return err(new Error(`ATC run did not finish within ${minutes} min (last status '${status.progress.status}'${status.progress.phase ? `, phase '${status.progress.phase}'` : ''}); it keeps running on SAP in worklist ${worklistId}`));
        }

        await sleep(pollInterval);
    }
}

function sameProgress(a: AtcRunProgress, b: AtcRunProgress): boolean {
    return a.status === b.status && a.description === b.description && a.phase === b.phase;
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
