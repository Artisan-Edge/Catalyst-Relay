/**
 * Parse Transport Tasks — Extract task IDs and their objects from transport XML
 */

import type { TransportObject } from './removeFromTransport';

export interface TaskContents {
    taskId: string;
    objects: TransportObject[];
}

/**
 * Parse the transport XML to extract task IDs and their objects.
 */
export function parseTransportTasks(doc: Document): TaskContents[] {
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
