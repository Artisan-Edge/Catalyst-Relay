/**
 * Integration Test: Function Group Includes (.asfugr / .asfinc / .asfunc)
 *
 * One upsert creates a group (main program, TOP, two own includes, one function module) →
 * activate → re-upsert (unchanged) → create a third include on its own (its INCLUDE line is
 * appended to the main program) → delete an include (its INCLUDE line is commented out, the
 * main program left inactive) → activate → delete the group (includes and module go with it).
 * The group is ZCAT_IT_<stamp>F and is deleted in afterAll whatever happened.
 *
 * Run with: bun test --path-ignore-patterns=node_modules/** src/__tests__/integration/function-group-workflow.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { TEST_CONFIG, createTestClient, shouldSkip, safeLogout, deleteExisting } from './test-helpers';
import type { ADTClient } from '../../core';
import type { ObjectContent, ObjectRef } from '../../types/requests';

const STAMP = Date.now().toString(36).toUpperCase().slice(-6);
const GROUP = `ZCAT_IT_${STAMP}F`;
const TOP = `L${GROUP}TOP`;
const USED = `L${GROUP}F01`;
const SPARE = `L${GROUP}F02`;
const ADDED = `L${GROUP}F03`;
const MODULE = `Z_CAT_IT_${STAMP}_HELLO`;

const GROUP_REF: ObjectRef = { name: GROUP, extension: 'asfugr' };
const MODULE_REF: ObjectRef = { name: MODULE, extension: 'asfunc', container: GROUP };

// Creates need a description (SAP: "Enter a title")
function include(name: string, content: string): ObjectContent {
    return { name, extension: 'asfinc', container: GROUP, content, description: `Catalyst relay ${name}` };
}

function includeRef(name: string): ObjectRef {
    return { name, extension: 'asfinc', container: GROUP };
}

const MAIN_SOURCE = `*******************************************************************
*   System-defined Include-files.                                 *
*******************************************************************
  INCLUDE ${TOP}.                   " Global Declarations
  INCLUDE L${GROUP}UXX.                   " Function Modules

*******************************************************************
*   User-defined Include-files (if necessary).                    *
*******************************************************************
  INCLUDE ${USED}.                   " Subroutines
  INCLUDE ${SPARE}.                   " Spare, deleted by the test`;

const OBJECTS: ObjectContent[] = [
    { ...GROUP_REF, content: MAIN_SOURCE, description: 'Catalyst relay test group' },
    include(TOP, `FUNCTION-POOL ${GROUP.toLowerCase()}.\nDATA gv_counter TYPE i.`),
    include(USED, 'FORM increment.\n  gv_counter = gv_counter + 1.\nENDFORM.'),
    include(SPARE, 'FORM reset.\n  CLEAR gv_counter.\nENDFORM.'),
    {
        ...MODULE_REF,
        content: `FUNCTION ${MODULE.toLowerCase()}\n  EXPORTING\n    VALUE(result) TYPE string.\n\n  PERFORM increment.\n  result = |Hello { gv_counter }|.\nENDFUNCTION.`,
        description: 'Catalyst relay test module',
    },
];

async function mainSource(client: ADTClient): Promise<string> {
    const [read, error] = await client.read([GROUP_REF]);
    expect(error).toBeNull();
    return read![0]!.content;
}

describe('Function Group Includes Workflow', () => {
    let client: ADTClient | null = null;

    beforeAll(async () => {
        const [newClient, err] = await createTestClient();
        if (err) throw err;
        client = newClient;
    });

    afterAll(async () => {
        await safeLogout(client);
        await deleteExisting([GROUP_REF], TEST_CONFIG.transport);
    }, 120000);

    it('creates the group, its includes and its module in one upsert', async () => {
        if (shouldSkip(client)) return;

        const [results, error] = await client!.upsert(OBJECTS, TEST_CONFIG.package, TEST_CONFIG.transport);
        expect(error).toBeNull();
        const statuses = Object.fromEntries(results!.map(r => [r.name.toUpperCase(), r.status]));
        expect(statuses[GROUP]).toBe('created');
        expect(statuses[USED]).toBe('created');
        expect(statuses[SPARE]).toBe('created');
        expect(statuses[MODULE]).toBe('created');
        // SAP creates TOP with the group; the source then updates it
        expect(['created', 'updated']).toContain(statuses[TOP] ?? 'missing');
    }, 180000);

    it('activates the group and its module', async () => {
        if (shouldSkip(client)) return;

        const [results, error] = await client!.activate([GROUP_REF, MODULE_REF]);
        expect(error).toBeNull();
        expect(results!.every(r => r.status === 'success')).toBe(true);
    }, 120000);

    it('reports a second upsert as unchanged', async () => {
        if (shouldSkip(client)) return;

        const [results, error] = await client!.upsert(OBJECTS, TEST_CONFIG.package, TEST_CONFIG.transport);
        expect(error).toBeNull();
        expect(results!.every(r => r.status === 'unchanged')).toBe(true);
    }, 180000);

    it('creates an include on its own and appends its INCLUDE line', async () => {
        if (shouldSkip(client)) return;

        const [results, error] = await client!.upsert([include(ADDED, 'FORM noop.\nENDFORM.')], TEST_CONFIG.package, TEST_CONFIG.transport);
        expect(error).toBeNull();
        expect(results!.find(r => r.name.toUpperCase() === ADDED)!.status).toBe('created');
        expect(await mainSource(client!)).toMatch(new RegExp(`^\\s*INCLUDE ${ADDED}\\.`, 'mi'));

        const [activated, activateErr] = await client!.activate([GROUP_REF]);
        expect(activateErr).toBeNull();
        expect(activated!.every(r => r.status === 'success')).toBe(true);
    }, 180000);

    it('deletes an include and comments out its INCLUDE line', async () => {
        if (shouldSkip(client)) return;

        const [results, error] = await client!.delete([includeRef(SPARE)], TEST_CONFIG.transport);
        expect(error).toBeNull();
        expect(results![0]).toMatchObject({ status: 'success' });

        const [read] = await client!.read([includeRef(SPARE)]);
        expect(read).toBeNull();
        expect(await mainSource(client!)).toMatch(new RegExp(`^\\*\\s*INCLUDE ${SPARE}\\.`, 'mi'));

        // The main program was left inactive; it activates without the include
        const [activated, activateErr] = await client!.activate([GROUP_REF]);
        expect(activateErr).toBeNull();
        expect(activated!.every(r => r.status === 'success')).toBe(true);
    }, 180000);

    it('deletes the group with its includes and module', async () => {
        if (shouldSkip(client)) return;

        const [results, error] = await client!.delete([GROUP_REF], TEST_CONFIG.transport);
        expect(error).toBeNull();
        expect(results![0]).toMatchObject({ status: 'success' });

        const [group] = await client!.read([GROUP_REF]);
        expect(group).toBeNull();
        const [used] = await client!.read([includeRef(USED)]);
        expect(used).toBeNull();
    }, 120000);
});
