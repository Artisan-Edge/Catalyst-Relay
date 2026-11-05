/**
 * Unit Tests for function group main programs (.asfugr) and includes (.asfinc)
 *
 * - Include names map to their group (L<group>xxx, namespaced /NS/L<group>xxx)
 * - Include create uses the v2 fincludes media type and a containerRef
 * - Listing keeps only the group's own includes and modules (not shared LSVIM*)
 * - Activation pulls in the group of an include, and the inactive includes and modules of a group
 * - Deleting an include ignores the reference from its own group
 * - Line-ending differences are not diffs
 */

import { describe, it, expect } from 'bun:test';
import { containerFromIncludeName, containerFromUri, groupFromMainProgramName, groupFromUri, isGeneratedInclude, owningGroupInSet } from '../../../../core/adt/functionGroup';
import { createObject } from '../../../../core/adt/craud/create';
import { resolveContainers } from '../../../../core/adt/craud/resolveContainers';
import { parseFunctionGroupParts } from '../../../../core/adt/discovery/functionGroupParts';
import { withFunctionGroupParts } from '../../../../core/adt/functionGroup';
import { multiDeleteObjects } from '../../../../core/adt/craud/multiDelete';
import type { AdtRequestor } from '../../../../core/adt';
import type { ObjectRef } from '../../../../types/requests';

interface Call {
    method: string;
    path: string;
    headers?: Record<string, string>;
    body?: string;
}

function recorder(respond: (call: Call) => Response): { requestor: AdtRequestor; calls: Call[] } {
    const calls: Call[] = [];
    const requestor: AdtRequestor = {
        request: async (options) => {
            const call: Call = { method: options.method, path: options.path };
            if (options.headers) call.headers = options.headers;
            if (options.body !== undefined) call.body = options.body;
            calls.push(call);
            return [respond(call), null];
        },
    };
    return { requestor, calls };
}

describe('function group include names', () => {
    it('derives the group from L<group><3 chars>', () => {
        expect(containerFromIncludeName('LZSNAP_C2TF01')).toBe('ZSNAP_C2T');
        expect(containerFromIncludeName('lzcat_fg_testtop')).toBe('ZCAT_FG_TEST');
        expect(containerFromIncludeName('/NS/LFOOTOP')).toBe('/NS/FOO');
    });

    it('returns null for names that are not group includes', () => {
        expect(containerFromIncludeName('ZINCLUDE')).toBeNull();
        expect(containerFromIncludeName('LTOP')).toBeNull();
    });

    it('reads the group from include and function module URIs', () => {
        expect(containerFromUri('/sap/bc/adt/functions/groups/zsnap_c2t/includes/lzsnap_c2tf01')).toBe('ZSNAP_C2T');
        expect(containerFromUri('/sap/bc/adt/functions/groups/zfyp7/fmodules/conversion_exit_zfyp7_input')).toBe('ZFYP7');
        expect(containerFromUri('/sap/bc/adt/functions/groups/zfyp7/source/main')).toBeNull();
    });

    it('reads the group from any URI under it, and from the main program name', () => {
        expect(groupFromUri('/sap/bc/adt/functions/groups/zfyp7')).toBe('ZFYP7');
        expect(groupFromUri('/sap/bc/adt/functions/groups/%2fns%2ffoo/source/main')).toBe('/NS/FOO');
        expect(groupFromUri('/sap/bc/adt/programs/programs/zfoo')).toBeNull();
        expect(groupFromMainProgramName('SAPLZFOO')).toBe('ZFOO');
        expect(groupFromMainProgramName('/NS/SAPLFOO')).toBe('/NS/FOO');
    });

    it('recognizes the generated L<group>UXX include only', () => {
        expect(isGeneratedInclude('LZFOOUXX')).toBe(true);
        expect(isGeneratedInclude('/NS/LFOOUXX')).toBe(true);
        expect(isGeneratedInclude('LZFOOU01')).toBe(false);
        expect(isGeneratedInclude('ZUXX')).toBe(false);
    });

    it('maps where-used hits of a group being deleted to that group', () => {
        const groups = new Set(['ZCAT_FG']);
        expect(owningGroupInSet({ name: 'LZCAT_FGT00', extension: 'asfinc', package: '', usageType: '', uri: '/sap/bc/adt/functions/groups/zcat_fg/includes/lzcat_fgt00' }, groups)).toBe('ZCAT_FG');
        expect(owningGroupInSet({ name: 'LZCAT_FGT00', extension: 'asinc', package: '', usageType: '' }, groups)).toBe('ZCAT_FG');
        expect(owningGroupInSet({ name: 'SAPLZCAT_FG', extension: 'asprog', package: '', usageType: '' }, groups)).toBe('ZCAT_FG');
        expect(owningGroupInSet({ name: 'ZCAT_FG', extension: 'asfugr', package: '', usageType: '' }, groups)).toBeNull();
        expect(owningGroupInSet({ name: 'LZOTHERT00', extension: 'asfinc', package: '', usageType: '' }, groups)).toBeNull();
        expect(owningGroupInSet({ name: 'ZCL_X', extension: 'aclass', package: '', usageType: '' }, groups)).toBeNull();
    });

    it('resolves an include container from its name without searching', async () => {
        const { requestor, calls } = recorder(() => new Response('', { status: 500 }));
        const objects: ObjectRef[] = [{ name: 'LZCAT_FG_TESTF01', extension: 'asfinc' }];
        const [resolved, error] = await resolveContainers(requestor, objects);

        expect(error).toBeNull();
        expect(resolved![0]!.container).toBe('ZCAT_FG_TEST');
        expect(calls).toHaveLength(0);
    });
});

describe('function group include create', () => {
    it('posts a finclude document with the v2 media type and a containerRef', async () => {
        const { requestor, calls } = recorder(() => new Response('', { status: 201 }));
        const [, error] = await createObject(requestor, { name: 'LZFOOF01', extension: 'asfinc', container: 'ZFOO', content: '', description: 'Forms' }, '$TMP', undefined, 'me');

        expect(error).toBeNull();
        expect(calls[0]!.path).toBe('/sap/bc/adt/functions/groups/zfoo/includes');
        expect(calls[0]!.headers!['Content-Type']).toBe('application/vnd.sap.adt.functions.fincludes.v2+xml');
        expect(calls[0]!.body).toContain('<finclude:abapFunctionGroupInclude');
        expect(calls[0]!.body).toContain('adtcore:type="FUGR/I"');
        expect(calls[0]!.body).toContain('<adtcore:containerRef adtcore:name="ZFOO" adtcore:type="FUGR/F" adtcore:uri="/sap/bc/adt/functions/groups/zfoo"/>');
        expect(calls[0]!.body).not.toContain('packageRef');
    });
});

function node(type: string, name: string, uri: string, description = ''): string {
    return `<SEU_ADT_REPOSITORY_OBJ_NODE><OBJECT_TYPE>${type}</OBJECT_TYPE><OBJECT_NAME>${name}</OBJECT_NAME><TECH_NAME>${name}</TECH_NAME><OBJECT_URI>${uri}</OBJECT_URI><DESCRIPTION>${description}</DESCRIPTION></SEU_ADT_REPOSITORY_OBJ_NODE>`;
}

describe('parseFunctionGroupParts', () => {
    it("keeps the group's own includes and modules only", () => {
        const xml = `<?xml version="1.0" encoding="utf-8"?><asx:abap xmlns:asx="http://www.sap.com/abapxml"><asx:values><DATA><TREE_CONTENT>${[
            node('FUGR/FF', 'TABLEFRAME_ZSNAP_C2T', '/sap/bc/adt/functions/groups/zsnap_c2t/fmodules/tableframe_zsnap_c2t', 'Upper-level'),
            node('FUGR/I', 'LSVIMF04', '/sap/bc/adt/functions/groups/svim/includes/lsvimf04'),
            node('FUGR/I', 'LZSNAP_C2TF01', '/sap/bc/adt/functions/groups/zsnap_c2t/includes/lzsnap_c2tf01', 'Include LZSNAP_C2TF01'),
            node('FUGR/PD', 'GT_MAP', '/sap/bc/adt/functions/groups/zsnap_c2t/includes/lzsnap_c2ttop/source/main#name=GT_MAP'),
        ].join('')}</TREE_CONTENT></DATA></asx:values></asx:abap>`;

        const [parts, error] = parseFunctionGroupParts('ZSNAP_C2T', xml);

        expect(error).toBeNull();
        expect(parts!.includes.map(i => i.name)).toEqual(['LZSNAP_C2TF01']);
        expect(parts!.includes[0]!.description).toBe('Include LZSNAP_C2TF01');
        expect(parts!.functionModules.map(f => f.name)).toEqual(['TABLEFRAME_ZSNAP_C2T']);
    });
});

function inactiveXml(refs: { uri: string; type: string; name: string }[]): string {
    const entries = refs.map(r => `<ioc:entry><ioc:object ioc:user="ME" ioc:deleted="false"><ioc:ref adtcore:uri="${r.uri}" adtcore:type="${r.type}" adtcore:name="${r.name}"/></ioc:object></ioc:entry>`).join('');
    return `<?xml version="1.0" encoding="utf-8"?><ioc:inactiveObjects xmlns:ioc="http://www.sap.com/abapxml/inactiveCtsObjects" xmlns:adtcore="http://www.sap.com/adt/core">${entries}</ioc:inactiveObjects>`;
}

describe('withFunctionGroupParts', () => {
    it('adds the group of an include without looking up inactive objects', async () => {
        const { requestor, calls } = recorder(() => new Response('', { status: 500 }));
        const [refs] = await withFunctionGroupParts(requestor, [{ name: 'LZFOOF01', extension: 'asfinc', container: 'ZFOO' }]);

        expect(refs).toEqual([
            { name: 'LZFOOF01', extension: 'asfinc', container: 'ZFOO' },
            { name: 'ZFOO', extension: 'asfugr' },
        ]);
        expect(calls).toHaveLength(0);
    });

    it("adds a group's inactive includes but not its main program or other groups' includes", async () => {
        const xml = inactiveXml([
            { uri: '/sap/bc/adt/functions/groups/zfoo/includes/lzfoof01', type: 'FUGR/I', name: 'LZFOOF01' },
            { uri: '/sap/bc/adt/functions/groups/zfoo/source/main', type: 'FUGR/I', name: 'SAPLZFOO' },
            { uri: '/sap/bc/adt/functions/groups/zbar/includes/lzbarf01', type: 'FUGR/I', name: 'LZBARF01' },
        ]);
        const { requestor } = recorder(() => new Response(xml, { status: 200 }));
        const [refs] = await withFunctionGroupParts(requestor, [{ name: 'zfoo', extension: 'asfugr' }]);

        expect(refs).toEqual([
            { name: 'zfoo', extension: 'asfugr' },
            { name: 'LZFOOF01', extension: 'asfinc', container: 'ZFOO' },
        ]);
    });

    it("adds a group's inactive function modules", async () => {
        // The regression: activating a group alone failed while one of its modules was inactive
        const xml = inactiveXml([
            { uri: '/sap/bc/adt/functions/groups/zfoo/fmodules/z_foo_get', type: 'FUGR/FF', name: 'Z_FOO_GET' },
            { uri: '/sap/bc/adt/functions/groups/zbar/fmodules/z_bar_get', type: 'FUGR/FF', name: 'Z_BAR_GET' },
        ]);
        const { requestor } = recorder(() => new Response(xml, { status: 200 }));
        const [refs] = await withFunctionGroupParts(requestor, [{ name: 'ZFOO', extension: 'asfugr' }, { name: 'z_foo_get', extension: 'asfunc', container: 'ZFOO' }]);

        expect(refs).toEqual([
            { name: 'ZFOO', extension: 'asfugr' },
            { name: 'z_foo_get', extension: 'asfunc', container: 'ZFOO' },
        ]);

        const [alone] = await withFunctionGroupParts(requestor, [{ name: 'ZFOO', extension: 'asfugr' }]);
        expect(alone).toEqual([
            { name: 'ZFOO', extension: 'asfugr' },
            { name: 'Z_FOO_GET', extension: 'asfunc', container: 'ZFOO' },
        ]);
    });

    it('passes other objects through untouched', async () => {
        const { requestor, calls } = recorder(() => new Response('', { status: 500 }));
        const objects = [{ name: 'ZCL_FOO', extension: 'aclass' }];
        const [refs] = await withFunctionGroupParts(requestor, objects);

        expect(refs).toEqual(objects);
        expect(calls).toHaveLength(0);
    });
});

describe('deleting a function group include', () => {
    it('ignores the where-used reference from its own group', async () => {
        const whereUsed = `<?xml version="1.0" encoding="utf-8"?><usageReferences:usageReferenceResult xmlns:usageReferences="http://www.sap.com/adt/ris/usageReferences" xmlns:adtcore="http://www.sap.com/adt/core"><usageReferences:referencedObjects><usageReferences:referencedObject uri="/sap/bc/adt/functions/groups/zfoo" isResult="true" usageInformation="gradeDirect"><usageReferences:adtObject adtcore:name="ZFOO" adtcore:type="FUGR/F"><adtcore:packageRef adtcore:name="$TMP"/></usageReferences:adtObject></usageReferences:referencedObject></usageReferences:referencedObjects></usageReferences:usageReferenceResult>`;
        const { requestor, calls } = recorder(call => {
            if (call.path.includes('usageReferences')) return new Response(whereUsed, { status: 200 });
            if (call.method === 'POST' && call.path.endsWith('lzfoof01')) return new Response('<LOCK_HANDLE>H</LOCK_HANDLE>', { status: 200 });
            return new Response('', { status: 200 });
        });

        const [results, error] = await multiDeleteObjects(requestor, [{ name: 'LZFOOF01', extension: 'asfinc', container: 'ZFOO' }], undefined);

        expect(error).toBeNull();
        expect(results![0]!.status).toBe('success');
        expect(calls.some(c => c.method === 'DELETE' && c.path === '/sap/bc/adt/functions/groups/zfoo/includes/lzfoof01')).toBe(true);
    });
});
