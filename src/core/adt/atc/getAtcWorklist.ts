// Findings of an ATC worklist's last run (GET /sap/bc/adt/atc/worklists/{id})

import type { AsyncResult } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { AdtRequestor } from '../types';
import { checkResponse } from '../helpers';
import type { AtcObject } from './types';
import { parseAtcWorklist } from './parseAtcWorklist';

const WORKLISTS_PATH = '/sap/bc/adt/atc/worklists';
const WORKLIST_MEDIA_TYPE = 'application/atc.worklist.v1+xml';
// The object set of the worklist's last run
const LAST_RUN_OBJECT_SET = '99999999999999999999999999999999';
// A 25-object transport with 3,256 findings is a 4.3 MB body that takes ~10 s
const WORKLIST_TIMEOUT_MS = 180_000;

export async function getAtcWorklist(client: AdtRequestor, worklistId: string, includeExempted = false): AsyncResult<AtcObject[], Error> {
    const [response, requestErr] = await client.request({
        method: 'GET',
        path: `${WORKLISTS_PATH}/${encodeURIComponent(worklistId)}`,
        params: { usedObjectSet: LAST_RUN_OBJECT_SET, includeExemptedFindings: String(includeExempted) },
        headers: { 'Accept': WORKLIST_MEDIA_TYPE },
        timeout: WORKLIST_TIMEOUT_MS,
    });
    const [text, checkErr] = await checkResponse(response, requestErr, `Failed to read ATC worklist ${worklistId}`, WORKLIST_MEDIA_TYPE);
    if (checkErr) return err(checkErr);

    const [objects, parseErr] = parseAtcWorklist(text);
    if (parseErr) return err(new Error(`Failed to parse ATC worklist ${worklistId}: ${parseErr.message}`));
    return ok(objects);
}
