/**
 * Shared doubles for the IAM unit tests (fixtures captured on Madiba-Cloud-Dev, 2608)
 */

import * as fs from 'fs';
import * as path from 'path';
import type { AdtRequestor } from '../../../../core/adt';
import type { ClientState } from '../../../../client/types';

export const FIXTURES = path.join(import.meta.dir, '../../../fixtures/iam');
export const fixture = (name: string): string => fs.readFileSync(path.join(FIXTURES, name), 'utf8');

export interface Call {
    method: string;
    path: string;
    params?: Record<string, string | number>;
    headers?: Record<string, string>;
    body?: string;
    timeout?: number;
}

export type Reply = Response | Error;

export function recorder(respond: (call: Call) => Reply): { requestor: AdtRequestor; calls: Call[] } {
    const calls: Call[] = [];
    const requestor: AdtRequestor = {
        request: async (options) => {
            const call: Call = { method: options.method, path: options.path };
            if (options.params) call.params = options.params;
            if (options.headers) call.headers = options.headers;
            if (options.body !== undefined) call.body = options.body;
            if (options.timeout !== undefined) call.timeout = options.timeout;
            calls.push(call);
            const reply = respond(call);
            return reply instanceof Error ? [null, reply] : [reply, null];
        },
    };
    return { requestor, calls };
}

// Replies in order, the last one repeating.
export function sequence(replies: Array<() => Reply>): (call: Call) => Reply {
    let index = 0;
    return () => replies[Math.min(index++, replies.length - 1)]!();
}

export const xml = (body: string, status = 200): Response => new Response(body, { status });
export const STATE = { session: { username: 'CB9980000160' } } as unknown as ClientState;
export const IAM = '/sap/bc/adt/aps/cloud/iam';
export const LOCK = '<?xml version="1.0" encoding="UTF-8"?><asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0"><asx:values><DATA><LOCK_HANDLE>H1</LOCK_HANDLE></DATA></asx:values></asx:abap>';
export const NO_WAIT = { retryDelayMs: 0, deadlineMs: 60_000 };
export const publishing = (ns: string, status: string): string => `<?xml version="1.0" encoding="utf-8"?><${ns}:publishingStatus xmlns:${ns}="http://www.sap.com/iam/${ns}"><${ns}:publishingStatusText>${status}</${ns}:publishingStatusText></${ns}:publishingStatus>`;

// Lean2 with the app renamed, its service and ui5AppId removed (a fresh migrated app).
export function freshApp(name: string, migration = '3'): string {
    return fixture('sia6-lean2.xml')
        .replaceAll('ZSNAP_BC_LEAN2_EXT', name)
        .replace(/<sia6:services>[\s\S]*<\/sia6:services>/, '<sia6:services/>')
        .replace('<sia6:ui5AppId>ZSNAP_BC_UIAD_LEAN2</sia6:ui5AppId>', '<sia6:ui5AppId/>')
        .replace('<sia6:migrationStatus>3</sia6:migrationStatus>', migration ? `<sia6:migrationStatus>${migration}</sia6:migrationStatus>` : '<sia6:migrationStatus/>');
}

// SIA6 endpoint double: GET serves the current document, POST creates `created`, PUT replaces it.
export function appEndpoint(initial: string | null, created: string, stored = created): (call: Call) => Reply {
    let document = initial;
    return (call) => {
        if (call.path.endsWith('/service/detail')) return xml(fixture('sia6-servicedetail-ina1.xml'));
        if (call.path.endsWith('/sia6/publish')) return xml(fixture('publish-sia6.xml'));
        if (call.params?.['_action'] === 'LOCK') return xml(LOCK);
        if (call.params?.['_action'] === 'UNLOCK') return xml('');
        if (call.method === 'POST' && call.path === `${IAM}/sia6`) {
            document = stored;
            return xml(created, 201);
        }
        if (call.method === 'PUT') {
            document = call.body ?? document;
            return xml(document ?? '');
        }
        if (call.method === 'GET') return document ? xml(document) : xml('', 404);
        return xml('');
    };
}
