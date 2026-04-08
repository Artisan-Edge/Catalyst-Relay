/**
 * View Transport Objects — List all tasks and their objects on a transport
 */

import type { AsyncResult } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { AdtRequestor } from '../types';
import { extractError, safeParseXml } from '../../utils/xml';
import { parseTransportTasks } from './parseTransportTasks';
import type { TaskContents } from './parseTransportTasks';

const ACCEPT_HEADER = 'application/vnd.sap.adt.transportorganizer.v1+xml';

export async function viewTransportObjects(
    client: AdtRequestor,
    transportId: string
): AsyncResult<TaskContents[], Error> {
    const [response, requestErr] = await client.request({
        method: 'GET',
        path: `/sap/bc/adt/cts/transportrequests/${transportId}`,
        headers: { 'Accept': ACCEPT_HEADER },
    });

    if (requestErr) return err(requestErr);
    if (!response.ok) {
        const text = await response.text();
        const errorMsg = extractError(text);
        return err(new Error(`Failed to read transport ${transportId}: ${errorMsg}`));
    }

    const text = await response.text();
    const [doc, parseErr] = safeParseXml(text);
    if (parseErr) return err(parseErr);

    return ok(parseTransportTasks(doc));
}
