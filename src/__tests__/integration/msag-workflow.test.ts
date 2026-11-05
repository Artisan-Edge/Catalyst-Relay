/**
 * Integration Test: Message Class Workflow (.asmsag)
 *
 * create (with messages) → read back → re-upsert (unchanged) → edit (change text,
 * flip a self-explanatory flag, add, remove) → activate (skipped) → diff → delete →
 * re-create in the same session (cleaned up afterwards).
 *
 * Run with: bun test --path-ignore-patterns=node_modules/** src/__tests__/integration/msag-workflow.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { TEST_CONFIG, createTestClient, generateTestName, shouldSkip, safeLogout } from './test-helpers';
import type { ADTClient } from '../../core';
import type { ObjectContent, ObjectRef } from '../../types/requests';
import { getFormHandler } from '../../core/forms';
import { parseMessageClass, serializeMessageClass } from '../../core/msag';

// Unique per run (message class names are at most 20 characters); never touches an existing class.
const NAME = generateTestName('ZCAT_MC');
const REF: ObjectRef = { name: NAME, extension: 'asmsag' };

const INITIAL = `{
  "description": "Catalyst relay test message class",
  "messages": [
    { "number": "001", "text": "First message &1", "selfExplanatory": true },
    { "number": "002", "text": "Second message", "selfExplanatory": false },
    { "number": "003", "text": "Third message", "selfExplanatory": true }
  ]
}
`;

// 001 text changed, 002 flag flipped (text unchanged), 003 removed, 004 added.
const EDITED = `{
  "description": "Catalyst relay test message class v2",
  "messages": [
    { "number": "001", "text": "First message changed &1 &2", "selfExplanatory": true },
    { "number": "002", "text": "Second message", "selfExplanatory": true },
    { "number": "004", "text": "Fourth message", "selfExplanatory": false }
  ]
}
`;

function object(content: string): ObjectContent {
    return { ...REF, content };
}

describe('Message Class Workflow', () => {
    let client: ADTClient | null = null;

    beforeAll(async () => {
        const [newClient, err] = await createTestClient();
        if (err) throw err;
        client = newClient;
    });

    afterAll(async () => {
        const [existing] = client?.session ? await client.read([REF]) : [null];
        if (existing) {
            const [, deleteErr] = await client!.delete([REF], TEST_CONFIG.transport);
            if (deleteErr) console.warn(`Cleanup failed: ${deleteErr.message}`);
        }
        await safeLogout(client);
    });

    it('creates the class with its messages', async () => {
        if (shouldSkip(client)) return;

        const [results, error] = await client!.upsert([object(INITIAL)], TEST_CONFIG.package, TEST_CONFIG.transport);
        expect(error).toBeNull();
        expect(results![0]!.status).toBe('created');
    });

    it('reads it back as the canonical source', async () => {
        if (shouldSkip(client)) return;

        const [read, error] = await client!.read([REF]);
        expect(error).toBeNull();
        expect(read![0]!.content).toBe(INITIAL);
    });

    it('reports a second upsert as unchanged', async () => {
        if (shouldSkip(client)) return;

        const [results, error] = await client!.upsert([object(INITIAL)], TEST_CONFIG.package, TEST_CONFIG.transport);
        expect(error).toBeNull();
        expect(results![0]!.status).toBe('unchanged');
    });

    it('applies changes, additions, flag flips and removals', async () => {
        if (shouldSkip(client)) return;

        const [results, error] = await client!.upsert([object(EDITED)], TEST_CONFIG.package, TEST_CONFIG.transport);
        expect(error).toBeNull();
        expect(results![0]!.status).toBe('updated');

        const [read] = await client!.read([REF]);
        expect(read![0]!.content).toBe(EDITED);
        const [same] = getFormHandler('asmsag')!.equivalent(EDITED, read![0]!.content);
        expect(same).toBe(true);
    });

    it('skips activation', async () => {
        if (shouldSkip(client)) return;

        const [results, error] = await client!.activate([REF]);
        expect(error).toBeNull();
        expect(results![0]!.status).toBe('success');
        expect(results![0]!.messages[0]!.severity).toBe('info');
    });

    it('diffs one changed message as one changed line', async () => {
        if (shouldSkip(client)) return;

        const [def] = parseMessageClass(EDITED);
        const local = serializeMessageClass({ ...def!, messages: def!.messages.map(m => (m.number === '004' ? { ...m, text: 'Fourth, edited' } : m)) });
        const [results, error] = await client!.gitDiff([object(local)]);
        expect(error).toBeNull();
        expect(results![0]!.diffs).toHaveLength(1);
        expect(results![0]!.diffs[0]!.type).toBe('modification');
    });

    it('deletes the class', async () => {
        if (shouldSkip(client)) return;

        const [results, error] = await client!.delete([REF], TEST_CONFIG.transport);
        expect(error).toBeNull();
        expect(results![0]!.status).toBe('success');

        const [read] = await client!.read([REF]);
        expect(read).toBeNull();
    });

    it('reports the deleted class as not_found when deleted again', async () => {
        if (shouldSkip(client)) return;

        // SAP answers the delete of a missing message class with 200: was reported success
        const [results, error] = await client!.delete([REF], TEST_CONFIG.transport);
        expect(error).toBeNull();
        expect(results![0]!.status).toBe('not_found');
    });

    it('re-creates the class in the same session after deleting it', async () => {
        if (shouldSkip(client)) return;

        const [results, error] = await client!.upsert([object(INITIAL)], TEST_CONFIG.package, TEST_CONFIG.transport);
        expect(error).toBeNull();
        expect(results![0]!.status).toBe('created');

        const [read] = await client!.read([REF]);
        expect(read![0]!.content).toBe(INITIAL);
    });
});
