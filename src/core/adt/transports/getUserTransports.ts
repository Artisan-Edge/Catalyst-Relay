/**
 * Get User Transports — list transport requests owned by a user.
 *
 * Uses the transport-organizer tree query (the same request Eclipse uses for
 * its Transport Organizer view), which returns both workbench and customizing
 * requests, modifiable and released. This complements getTransports, whose
 * transportchecks query is package-scoped and can only ever return
 * modifiable workbench requests.
 */

import type { Result, AsyncResult } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { AdtRequestor } from '../types';
import { extractError, safeParseXml } from '../../utils/xml';
import type { TransportType } from './createTransport';

const TREE_ACCEPT_HEADER = 'application/vnd.sap.adt.transportorganizertree.v1+xml';

// SAP request-type (TRFUNCTION) and status (TRSTATUS) codes used by the tree query.
const REQUEST_TYPE_CODES = {
    workbench: 'K',
    customizing: 'W',
} as const;

const REQUEST_STATUS_CODES = {
    modifiable: 'D',
    released: 'R',
} as const;

export type TransportStatus = keyof typeof REQUEST_STATUS_CODES;

export interface UserTransportFilters {
    /** Request type — omit to include both workbench and customizing */
    type?: TransportType;
    /** Request status — omit to include both modifiable and released */
    status?: TransportStatus;
}

export interface UserTransport {
    id: string;
    description: string;
    owner: string;
    type: TransportType;
    status: TransportStatus;
    target: string;
    targetDescription: string;
    /** SAP timestamp of last change (YYYYMMDDHHMMSS) */
    lastChanged: string;
}

/**
 * List transport requests owned by a user.
 *
 * @param client - ADT client
 * @param user - Owner username to query requests for
 * @param filters - Optional type/status filters (applied server-side)
 * @returns Array of user transports or error
 */
export async function getUserTransports(client: AdtRequestor, user: string, filters?: UserTransportFilters): AsyncResult<UserTransport[], Error> {
    const requestType = filters?.type ? REQUEST_TYPE_CODES[filters.type] : 'KW';
    const requestStatus = filters?.status ? REQUEST_STATUS_CODES[filters.status] : 'DR';

    // Query the transport-organizer tree.
    const [response, requestErr] = await client.request({
        method: 'GET',
        path: '/sap/bc/adt/cts/transportrequests',
        params: {
            user,
            targets: 'true',
            requestType,
            requestStatus,
        },
        headers: {
            'Accept': TREE_ACCEPT_HEADER,
        },
    });

    // Validate successful response.
    if (requestErr) return err(requestErr);
    if (!response.ok) {
        const text = await response.text();
        return err(new Error(`Failed to fetch transports for user ${user}: ${extractError(text)}`));
    }

    // Parse transports from the tree response.
    const text = await response.text();
    return extractUserTransports(text);
}

/**
 * Extract requests from the organizer tree XML.
 *
 * The tree nests tm:request elements under category (tm:workbench /
 * tm:customizing), target (tm:target) and status (tm:modifiable /
 * tm:released) group elements. Type and status are read from the request's
 * own tm:type / tm:status code attributes; the target comes from the
 * enclosing tm:target group element.
 */
function extractUserTransports(xml: string): Result<UserTransport[], Error> {
    const [doc, parseErr] = safeParseXml(xml);
    if (parseErr) return err(parseErr);

    const transports: UserTransport[] = [];
    const requests = doc.getElementsByTagName('tm:request');

    for (let i = 0; i < requests.length; i++) {
        const el = requests[i];
        if (!el) continue;

        const id = el.getAttribute('tm:number');
        if (!id) continue;

        const type = decodeCode(REQUEST_TYPE_CODES, el.getAttribute('tm:type'));
        const status = decodeCode(REQUEST_STATUS_CODES, el.getAttribute('tm:status'));
        if (!type || !status) continue;

        const target = findTargetGroup(el);

        transports.push({
            id,
            description: el.getAttribute('tm:desc') || '',
            owner: el.getAttribute('tm:owner') || '',
            type,
            status,
            target: target.name,
            targetDescription: target.description,
            lastChanged: el.getAttribute('tm:lastchanged_timestamp') || '',
        });
    }

    return ok(transports);
}

// Map a SAP code back to its label (e.g., 'K' → 'workbench'), or null if unknown.
function decodeCode<T extends Record<string, string>>(codes: T, value: string | null): keyof T | null {
    if (!value) return null;

    for (const [label, code] of Object.entries(codes)) {
        if (code === value) return label as keyof T;
    }
    return null;
}

// Walk up to the enclosing tm:target group element for the transport target.
function findTargetGroup(el: Element): { name: string; description: string } {
    let node = el.parentNode;
    while (node) {
        if (node.nodeType === 1 && (node as Element).tagName === 'tm:target') {
            const target = node as Element;
            return {
                name: target.getAttribute('tm:name') || '',
                description: target.getAttribute('tm:desc') || '',
            };
        }
        node = node.parentNode;
    }
    return { name: '', description: '' };
}
