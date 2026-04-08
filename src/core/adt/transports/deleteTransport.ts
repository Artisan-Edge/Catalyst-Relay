/**
 * Delete Transport — Delete a transport request
 *
 * SAP transports have a hierarchy: Request → Tasks → Objects.
 * To delete a request, all tasks must be deleted first.
 * To delete a task, all objects must be removed from it first.
 */

import type { AsyncResult } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { AdtRequestor } from '../types';
import { extractError, safeParseXml } from '../../utils/xml';
import { removeFromTransport } from './removeFromTransport';
import type { TransportObject } from './removeFromTransport';

const ACCEPT_HEADER = 'application/vnd.sap.adt.transportorganizer.v1+xml';

interface TaskContents {
    taskId: string;
    objects: TransportObject[];
}

/**
 * Parse the transport XML to extract task IDs and their objects.
 */
function parseTransportTasks(doc: Document): TaskContents[] {
    const tasks: TaskContents[] = [];
    const taskElements = doc.getElementsByTagName('tm:task');

    for (let i = 0; i < taskElements.length; i++) {
        const taskEl = taskElements[i];
        if (!taskEl) continue;

        const taskId = taskEl.getAttribute('tm:number');
        if (!taskId) continue;

        const objects: TransportObject[] = [];
        const objectElements = taskEl.getElementsByTagName('tm:abap_object');

        for (let j = 0; j < objectElements.length; j++) {
            const el = objectElements[j];
            if (!el) continue;

            const name = el.getAttribute('tm:name');
            if (!name) continue;

            objects.push({
                name,
                description: el.getAttribute('tm:obj_desc') || el.getAttribute('tm:obj_info') || '',
                pgmid: el.getAttribute('tm:pgmid') || '',
                type: el.getAttribute('tm:type') || '',
                position: el.getAttribute('tm:position') || '',
            });
        }

        tasks.push({ taskId, objects });
    }

    return tasks;
}

/**
 * Sort and compress a task to consolidate duplicate entries.
 *
 * Deleting tables creates two different entries on a transport that must be merged before removal.
 */
async function sortAndCompress(
    client: AdtRequestor,
    taskId: string
): AsyncResult<void, Error> {
    const [response, requestErr] = await client.request({
        method: 'POST',
        path: `/sap/bc/adt/cts/transportrequests/${taskId}/sortandcompress`,
        headers: { 'Accept': ACCEPT_HEADER },
    });

    if (requestErr) return err(requestErr);
    if (!response.ok) {
        const text = await response.text();
        const errorMsg = extractError(text);
        return err(new Error(`Failed to sort and compress task ${taskId}: ${errorMsg}`));
    }

    return ok(undefined);
}

/**
 * Send a DELETE request for a transport or task.
 */
async function deleteRequest(
    client: AdtRequestor,
    id: string
): AsyncResult<void, Error> {
    const [response, requestErr] = await client.request({
        method: 'DELETE',
        path: `/sap/bc/adt/cts/transportrequests/${id}`,
        headers: { 'Accept': ACCEPT_HEADER },
    });

    if (requestErr) return err(requestErr);
    if (!response.ok) {
        const text = await response.text();
        const errorMsg = extractError(text);
        return err(new Error(`Failed to delete ${id}: ${errorMsg}`));
    }

    return ok(undefined);
}

/**
 * Delete a transport request
 *
 * @param client - ADT client
 * @param transportId - Transport request ID (e.g., 'DS4K904713')
 * @param removeObjects - If true, removes all objects from tasks before deleting
 * @returns void on success or error
 */
export async function deleteTransport(
    client: AdtRequestor,
    transportId: string,
    removeObjects = false
): AsyncResult<void, Error> {
    // Read the transport to discover its task hierarchy.
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

    const tasks = parseTransportTasks(doc);

    // Process each task: sort+compress, remove objects, then delete the task.
    for (const task of tasks) {
        if (removeObjects && task.objects.length > 0) {
            // Consolidate duplicate entries before removal.
            const [, compressErr] = await sortAndCompress(client, task.taskId);
            if (compressErr) return err(compressErr);

            // Re-read the task after compression (entries and positions change).
            const [taskResponse, taskReadErr] = await client.request({
                method: 'GET',
                path: `/sap/bc/adt/cts/transportrequests/${task.taskId}`,
                headers: { 'Accept': ACCEPT_HEADER },
            });
            if (taskReadErr) return err(taskReadErr);

            const taskText = await taskResponse.text();
            const [taskDoc, taskParseErr] = safeParseXml(taskText);
            if (taskParseErr) return err(taskParseErr);

            // Extract fresh object list from the compressed task.
            const elements = taskDoc.getElementsByTagName('tm:abap_object');
            for (let i = 0; i < elements.length; i++) {
                const el = elements[i];
                if (!el) continue;
                const name = el.getAttribute('tm:name');
                if (!name) continue;

                const [, removeErr] = await removeFromTransport(client, task.taskId, {
                    name,
                    description: el.getAttribute('tm:obj_desc') || el.getAttribute('tm:obj_info') || '',
                    pgmid: el.getAttribute('tm:pgmid') || '',
                    type: el.getAttribute('tm:type') || '',
                    position: el.getAttribute('tm:position') || '',
                });
                if (removeErr) return err(removeErr);
            }
        }

        const [, taskErr] = await deleteRequest(client, task.taskId);
        if (taskErr) return err(taskErr);
    }

    // Delete the parent request.
    return deleteRequest(client, transportId);
}
