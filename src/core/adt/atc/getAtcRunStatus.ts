// Status of a background ATC run (GET on the run's Location, application/vnd.sap.atc.run.v1+xml)

import type { AsyncResult, Result } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { AdtRequestor } from '../types';
import { checkResponse } from '../helpers';
import { safeParseXml } from '../../utils/xml';
import { childElements, firstChildElement } from '../../utils/xmlDom';
import type { AtcRunProgress } from './types';

// The run resource also answers application/vnd.sap.adt.backgroundrun.v1+xml, which lacks the phases
const RUN_MEDIA_TYPE = 'application/vnd.sap.atc.run.v1+xml';
const COMPLETED = 'Completed';
const PENDING_STATUSES = new Set(['Not Yet Started', 'Running']);
const PHASE_IN_PROCESS = 'In Process';
const WORKLIST_RELATION = /\/relations\/results\/worklistid$/;

export type AtcRunState = 'pending' | 'completed' | 'failed';

export interface AtcRunStatus {
    state: AtcRunState;
    progress: AtcRunProgress;
}

export async function getAtcRunStatus(client: AdtRequestor, runUri: string): AsyncResult<AtcRunStatus, Error> {
    const [response, requestErr] = await client.request({
        method: 'GET',
        path: runUri,
        headers: { 'Accept': RUN_MEDIA_TYPE },
    });
    const [text, checkErr] = await checkResponse(response, requestErr, 'Failed to read the ATC run status', RUN_MEDIA_TYPE);
    if (checkErr) return err(checkErr);

    return parseAtcRunStatus(text);
}

export function parseAtcRunStatus(xml: string): Result<AtcRunStatus, Error> {
    const [doc, parseErr] = safeParseXml(xml);
    if (parseErr) return err(parseErr);

    const root = doc.documentElement;
    if (!root || root.localName !== 'run') return err(new Error(`Unexpected ATC run status response: <${root?.nodeName ?? 'empty'}>`));

    const status = root.getAttribute('status') ?? '';
    const description = firstChildElement(root, 'progress')?.getAttribute('description') ?? '';
    const phase = childElements(firstChildElement(root, 'phases'), 'phase').find(element => element.getAttribute('status') === PHASE_IN_PROCESS)?.getAttribute('title');
    const progress: AtcRunProgress = { status, description, ...(phase ? { phase } : {}) };

    return ok({ state: runState(status, hasWorklistLink(root)), progress });
}

// A status this code does not know counts as finished when the run links its worklist, as a
// completed run does, and as failed otherwise
function runState(status: string, linksWorklist: boolean): AtcRunState {
    if (status === COMPLETED) return 'completed';
    if (PENDING_STATUSES.has(status)) return 'pending';
    return linksWorklist ? 'completed' : 'failed';
}

function hasWorklistLink(root: Element): boolean {
    return childElements(root, 'link').some(link => WORKLIST_RELATION.test(link.getAttribute('rel') ?? ''));
}
