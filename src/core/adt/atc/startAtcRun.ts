// Start an ATC run in the background: create a worklist, then POST the run with clientWait=false

import type { AsyncResult } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { AdtRequestor } from '../types';
import { checkResponse } from '../helpers';
import { escapeXml } from '../../utils/xml';

const WORKLISTS_PATH = '/sap/bc/adt/atc/worklists';
const RUNS_PATH = '/sap/bc/adt/atc/runs';
const WORKLIST_ID = /^[0-9A-F]{32}$/i;
const HTTP_CREATED = 201;
// High enough never to cap a run (a 25-object transport of generated classes had 3,256 findings)
const MAX_VERDICTS = 100_000;

export interface StartedAtcRun {
    worklistId: string;
    /** The run's own resource (Location of the POST), polled for status */
    runUri: string;
}

export async function startAtcRun(client: AdtRequestor, checkVariant: string, uris: readonly string[]): AsyncResult<StartedAtcRun, Error> {
    if (uris.length === 0) return err(new Error('No objects, packages or transports to check'));

    // A worklist holds the run's findings
    const [worklistResponse, worklistRequestErr] = await client.request({
        method: 'POST',
        path: WORKLISTS_PATH,
        params: { checkVariant },
        headers: { 'Accept': 'text/plain' },
    });
    const [worklistText, worklistErr] = await checkResponse(worklistResponse, worklistRequestErr, `Failed to create an ATC worklist for check variant ${checkVariant}`);
    if (worklistErr) return err(worklistErr);

    const worklistId = worklistText.trim();
    if (!WORKLIST_ID.test(worklistId)) return err(new Error(`Unexpected ATC worklist id: ${worklistId.substring(0, 200)}`));

    // Without clientWait=false the POST blocks until the run ends, which outlasts the ICM timeout for transports of large classes
    const [runResponse, runRequestErr] = await client.request({
        method: 'POST',
        path: RUNS_PATH,
        params: { worklistId, clientWait: 'false' },
        headers: { 'Content-Type': 'application/xml', 'Accept': 'application/xml' },
        body: buildRunBody(uris),
    });
    const [, runErr] = await checkResponse(runResponse, runRequestErr, 'Failed to start the ATC run');
    if (runErr) return err(runErr);

    const runUri = runResponse?.headers.get('location');
    if (runResponse?.status !== HTTP_CREATED || !runUri) return err(new Error(`ATC run did not start in the background (HTTP ${runResponse?.status}, no Location header)`));

    return ok({ worklistId, runUri });
}

export function buildRunBody(uris: readonly string[]): string {
    const references = uris.map(uri => `<adtcore:objectReference adtcore:uri="${escapeXml(uri)}"/>`).join('');
    return '<?xml version="1.0" encoding="UTF-8"?>'
        + `<atc:run maximumVerdicts="${MAX_VERDICTS}" xmlns:atc="http://www.sap.com/adt/atc">`
        + '<objectSets xmlns:adtcore="http://www.sap.com/adt/core"><objectSet kind="inclusive">'
        + `<adtcore:objectReferences>${references}</adtcore:objectReferences>`
        + '</objectSet></objectSets></atc:run>';
}
