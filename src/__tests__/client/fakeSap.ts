/**
 * Fake SAP for client method tests: records every request and answers from per-test rules
 *
 * Objects created by a POST to a collection exist afterwards (GET answers 200); the rest 404.
 */

import type { AdtRequestor } from '../../core/adt';
import type { ClientState } from '../../client/types';

export interface Call {
    method: string;
    path: string;
    params: Record<string, string>;
    headers: Record<string, string>;
    body?: string;
}

export type Rule = (call: Call) => Response | null;

const LOCK_RESPONSE = '<asx:abap xmlns:asx="http://www.sap.com/abapxml"><asx:values><DATA><LOCK_HANDLE>H</LOCK_HANDLE></DATA></asx:values></asx:abap>';
const CREATED = 201;
const NOT_FOUND = 404;

export interface FakeSap {
    requestor: AdtRequestor;
    calls: Call[];
    /** Object URIs that exist, mapped to their content (GET body) */
    objects: Map<string, string>;
}

/**
 * @param rules - Tried in order; the first non-null response wins. Defaults: lock/unlock succeed,
 *   POST to a collection creates, GET answers stored content or 404, PUT/DELETE succeed.
 */
export function fakeSap(rules: Rule[] = []): FakeSap {
    const calls: Call[] = [];
    const objects = new Map<string, string>();
    const requestor: AdtRequestor = {
        request: async (options) => {
            const params: Record<string, string> = {};
            for (const [key, value] of Object.entries(options.params ?? {})) params[key] = String(value);
            const call: Call = { method: options.method, path: options.path, params, headers: options.headers ?? {} };
            if (options.body !== undefined) call.body = options.body;
            calls.push(call);

            for (const rule of rules) {
                const response = rule(call);
                if (response) return [response, null];
            }
            return [defaultResponse(call, objects), null];
        },
    };
    return { requestor, calls, objects };
}

function defaultResponse(call: Call, objects: Map<string, string>): Response {
    if (call.params['_action'] === 'LOCK') return new Response(LOCK_RESPONSE, { status: 200 });
    if (call.params['_action'] === 'UNLOCK') return new Response('', { status: 200 });
    if (call.method === 'POST') {
        const name = /adtcore:name="([^"]+)"/.exec(call.body ?? '')?.[1];
        if (name) objects.set(`${call.path}/${name.toLowerCase()}`, '');
        return new Response('', { status: CREATED });
    }
    if (call.method === 'GET') {
        const content = objects.get(call.path) ?? objects.get(call.path.replace(/\/source\/main$/, ''));
        return content === undefined ? new Response('', { status: NOT_FOUND }) : new Response(content, { status: 200 });
    }
    return new Response('', { status: 200 });
}

/**
 * A logged-in client state (the methods only check that a session exists)
 */
export function loggedIn(): ClientState {
    return { session: { sessionId: 'S', username: 'TESTER', expiresAt: Number.MAX_SAFE_INTEGER } } as unknown as ClientState;
}

export function isLock(call: Call): boolean {
    return call.params['_action'] === 'LOCK';
}

export function isUnlock(call: Call): boolean {
    return call.params['_action'] === 'UNLOCK';
}

// A create POST: a POST that is not a lock, unlock or other action
export function isCreate(call: Call): boolean {
    return call.method === 'POST' && !call.params['_action'] && !call.path.includes('/repository/') && !call.path.includes('/activation');
}
