/**
 * Unit Tests for Fiori launchpad sources (.asuiad, .asuipg, .asuist)
 *
 * - Registry: ADT types map to the extensions; the tree lists them as supported objects
 * - Create: blues v2 shell at the fiori collection, description from header / title / name
 * - An empty or non-object source (every type), and a space without header.description and
 *   header.originalLanguage, are refused before any request
 * - Read and write /source/main as JSON with lock handle and corrNr
 * - Equivalence (fixtures captured on Madiba-Cloud-Dev): the header SAP adds, the visualization
 *   defaults it drops on pages (type, displayFormat, tile assignment catalogType) and the false
 *   booleans it drops are no change
 * - Activation: UIAD is saved active; pages and spaces go through the activation run, warnings pass
 * - Move is refused
 */

import { describe, it, expect } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { createObject } from '../../../../core/adt/craud/create';
import { readObject } from '../../../../core/adt/craud/read';
import { updateObject } from '../../../../core/adt/craud/update';
import { contentEquivalent } from '../../../../core/adt/craud/contentEquivalent';
import { activateObjects } from '../../../../core/adt/craud/activation';
import { parseTreeXml } from '../../../../core/adt/discovery/tree/parsers';
import { resolveMoveTarget } from '../../../../core/adt/refactoring/moveTargets';
import { affJsonDescription, requireAffJsonPaths } from '../../../../core/adt/aff';
import { applyAffJsonRules } from '../../../../core/adt/aff/applyAffJsonRules';
import { getConfigByType, OBJECT_CONFIG_MAP } from '../../../../core/adt/types';
import type { AdtRequestor } from '../../../../core/adt';

const FIXTURES = path.join(import.meta.dir, '../../../fixtures/launchpad');

function fixture(name: string): string {
    return fs.readFileSync(path.join(FIXTURES, name), 'utf8');
}

interface Call {
    method: string;
    path: string;
    params?: Record<string, string | number>;
    headers?: Record<string, string>;
    body?: string;
}

function recorder(respond: (call: Call) => Response = () => new Response('', { status: 200 })): { requestor: AdtRequestor; calls: Call[] } {
    const calls: Call[] = [];
    const requestor: AdtRequestor = {
        request: async (options) => {
            const call: Call = { method: options.method, path: options.path };
            if (options.params) call.params = options.params;
            if (options.headers) call.headers = options.headers;
            if (options.body !== undefined) call.body = options.body;
            calls.push(call);
            return [respond(call), null];
        },
    };
    return { requestor, calls };
}

function withoutKey(json: string, key: string): string {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    delete parsed[key];
    return JSON.stringify(parsed, null, 2);
}

describe('launchpad type registry', () => {
    it('maps the ADT types to their extensions', () => {
        expect(getConfigByType('UIAD/TYP')?.extension).toBe('asuiad');
        expect(getConfigByType('UIPG/TYP')?.extension).toBe('asuipg');
        expect(getConfigByType('UIST/TOP')?.extension).toBe('asuist');
    });

    it('lists the objects of a FIORI_UI tree folder as supported', () => {
        const xml = `<?xml version="1.0" encoding="utf-8"?><vfs:virtualFoldersResult xmlns:vfs="http://www.sap.com/adt/ris/virtualFolders">
<vfs:object name="ZSNAP_BC_UIAD_TEST" type="UIAD/TYP" uri="/sap/bc/adt/fiori/uiad/zsnap_bc_uiad_test" text="SNAP BC Test"/>
<vfs:object name="ZSNAP_BC_PAGE_TEST" type="UIPG/TYP" uri="/sap/bc/adt/fiori/uipgtyp/zsnap_bc_page_test" text="SNAP BC Test Page"/>
<vfs:object name="ZSNAP_BC_SPACE_TEST" type="UIST/TOP" uri="/sap/bc/adt/fiori/uisttop/zsnap_bc_space_test" text="SNAP BC Test Space"/>
</vfs:virtualFoldersResult>`;

        const [parsed, error] = parseTreeXml(xml);

        expect(error).toBeNull();
        expect(parsed!.unsupportedObjects).toEqual([]);
        expect(parsed!.objects.map(o => `${o.name}.${o.extension}`)).toEqual(['ZSNAP_BC_UIAD_TEST.asuiad', 'ZSNAP_BC_PAGE_TEST.asuipg', 'ZSNAP_BC_SPACE_TEST.asuist']);
    });

    it('refuses to move them', () => {
        for (const extension of ['asuiad', 'asuipg', 'asuist']) {
            const [target, error] = resolveMoveTarget(extension);
            expect(target).toBeNull();
            expect(error?.message).toContain('not supported');
        }
    });
});

describe('launchpad create', () => {
    it('posts a blues v2 shell to the fiori collection', async () => {
        const { requestor, calls } = recorder(() => new Response('', { status: 201 }));

        const [, error] = await createObject(requestor, { name: 'zsnap_bc_page_test', extension: 'asuipg', content: fixture('uipg-put.json') }, 'ZSNAP_BC', 'TR1', 'me');

        expect(error).toBeNull();
        expect(calls).toHaveLength(1);
        expect(calls[0]!.path).toBe('/sap/bc/adt/fiori/uipgtyp');
        expect(calls[0]!.params).toEqual({ corrNr: 'TR1' });
        expect(calls[0]!.headers!['Content-Type']).toBe('application/vnd.sap.adt.blues.v2+xml');
        expect(calls[0]!.body).toContain('<blue:blueSource xmlns:blue="http://www.sap.com/wbobj/blue"');
        expect(calls[0]!.body).toContain('adtcore:type="UIPG/TYP"');
        expect(calls[0]!.body).toContain('adtcore:name="ZSNAP_BC_PAGE_TEST"');
        expect(calls[0]!.body).toContain('adtcore:description="SNAP BC Test Page"');
        expect(calls[0]!.body).toContain('<adtcore:packageRef adtcore:name="ZSNAP_BC"/>');
    });

    it('uses the collection of each type', async () => {
        const { requestor, calls } = recorder(() => new Response('', { status: 201 }));

        await createObject(requestor, { name: 'ZA', extension: 'asuiad', content: fixture('uiad-readback.json') }, 'ZSNAP_BC', undefined, 'me');
        await createObject(requestor, { name: 'ZS', extension: 'asuist', content: fixture('uist-put.json') }, 'ZSNAP_BC', undefined, 'me');

        expect(calls.map(c => c.path)).toEqual(['/sap/bc/adt/fiori/uiad', '/sap/bc/adt/fiori/uisttop']);
        expect(calls[0]!.body).toContain('adtcore:type="UIAD/TYP"');
        expect(calls[1]!.body).toContain('adtcore:type="UIST/TOP"');
    });

    it('takes the description from generalInformation.title, then the name', () => {
        const page = withoutKey(fixture('uipg-put.json'), 'header');
        expect(affJsonDescription(page)).toBe('SNAP BC Test Page');
        expect(affJsonDescription(fixture('uiad-readback.json'))).toBe('SNAP BC Test');
        expect(affJsonDescription('{"formatVersion":"2"}')).toBe('');
    });

    it('falls back to the object name without header and title', async () => {
        const { requestor, calls } = recorder(() => new Response('', { status: 201 }));
        const uiad = withoutKey(fixture('uiad-readback.json'), 'header');

        await createObject(requestor, { name: 'ZSNAP_BC_CLI_UIAD', extension: 'asuiad', content: uiad }, 'ZSNAP_BC', undefined, 'me');

        expect(calls[0]!.body).toContain('adtcore:description="ZSNAP_BC_CLI_UIAD"');
    });

    it('refuses an empty source or one that is not a JSON object for every launchpad type before any request', async () => {
        for (const extension of ['asuiad', 'asuipg', 'asuist']) {
            for (const content of ['', '   ', 'not json', '[]', '"x"', '{}']) {
                const { requestor, calls } = recorder(() => new Response('', { status: 201 }));
                const [, error] = await createObject(requestor, { name: 'ZX', extension, content }, 'ZSNAP_BC', undefined, 'me');
                expect(calls).toHaveLength(0);
                expect(error?.message).toEndWith('ZX: the source is empty or not a JSON object');
            }
        }
    });

    it('refuses a space without header description and original language before any request', async () => {
        const { requestor, calls } = recorder(() => new Response('', { status: 201 }));
        const space = withoutKey(fixture('uist-put.json'), 'header');

        const [, error] = await createObject(requestor, { name: 'ZS', extension: 'asuist', content: space }, 'ZSNAP_BC', undefined, 'me');

        expect(calls).toHaveLength(0);
        expect(error?.message).toBe('Launchpad Space Template ZS: header.description and header.originalLanguage are required (SAP fails the save without them)');
    });
});

describe('launchpad read and write', () => {
    it('reads /source/main as JSON', async () => {
        const { requestor, calls } = recorder(() => new Response(fixture('uiad-readback.json'), { status: 200 }));

        const [object, error] = await readObject(requestor, { name: 'ZSNAP_BC_UIAD_TEST', extension: 'asuiad' });

        expect(error).toBeNull();
        expect(object!.content).toBe(fixture('uiad-readback.json'));
        expect(calls[0]!.path).toBe('/sap/bc/adt/fiori/uiad/zsnap_bc_uiad_test/source/main');
        expect(calls[0]!.headers!['Accept']).toBe('application/json');
    });

    it('PUTs JSON to /source/main with the lock handle and corrNr', async () => {
        const { requestor, calls } = recorder();

        const [, error] = await updateObject(requestor, { name: 'ZSNAP_BC_SPACE_TEST', extension: 'asuist', content: fixture('uist-put.json') }, 'H1', 'TR1');

        expect(error).toBeNull();
        expect(calls[0]!.method).toBe('PUT');
        expect(calls[0]!.path).toBe('/sap/bc/adt/fiori/uisttop/zsnap_bc_space_test/source/main');
        expect(calls[0]!.params).toEqual({ lockHandle: 'H1', corrNr: 'TR1' });
        expect(calls[0]!.headers!['Content-Type']).toBe('application/json');
    });

    it('refuses to PUT a space without the required header', async () => {
        const { requestor, calls } = recorder();
        const space = JSON.stringify({ formatVersion: '1', header: { description: 'x' }, generalInformation: { title: 'x' } });

        const [, error] = await updateObject(requestor, { name: 'ZS', extension: 'asuist', content: space }, 'H1', undefined);

        expect(calls).toHaveLength(0);
        expect(error?.message).toContain('header.originalLanguage is required');
    });

    it('locks and deletes on the object URI', () => {
        expect(OBJECT_CONFIG_MAP.asuiad.lockOnObject).toBe(true);
        expect(OBJECT_CONFIG_MAP.asuipg.lockOnObject).toBe(true);
        expect(OBJECT_CONFIG_MAP.asuist.lockOnObject).toBe(true);
    });
});

describe('launchpad equivalence', () => {
    it('ignores the visualization defaults SAP drops from a page', () => {
        expect(contentEquivalent('asuipg', fixture('uipg-put.json'), fixture('uipg-readback.json'))).toEqual([true, null]);
    });

    it('still sees a non-default display format', () => {
        const local = fixture('uipg-put.json').replace('"displayFormat": "standard"', '"displayFormat": "wide"');
        expect(contentEquivalent('asuipg', local, fixture('uipg-readback.json'))).toEqual([false, null]);
    });

    it('treats a space read-back as unchanged', () => {
        expect(contentEquivalent('asuist', fixture('uist-put.json'), fixture('uist-readback.json'))).toEqual([true, null]);
    });

    it('does not own the header SAP adds when the source has none', () => {
        const local = withoutKey(fixture('uiad-readback.json'), 'header');
        expect(contentEquivalent('asuiad', local, fixture('uiad-readback.json'))).toEqual([true, null]);
    });

    it('does not own header keys the source leaves out', () => {
        const page = JSON.parse(fixture('uipg-put.json')) as { header: Record<string, string> };
        page.header = { description: 'SNAP BC Test Page' };
        expect(contentEquivalent('asuipg', JSON.stringify(page), fixture('uipg-readback.json'))).toEqual([true, null]);
    });

    it('compares a header value the source sets', () => {
        const local = fixture('uiad-readback.json').replace('"description": "SNAP BC Test"', '"description": "Other"');
        expect(contentEquivalent('asuiad', local, fixture('uiad-readback.json'))).toEqual([false, null]);
    });

    it('treats false booleans SAP drops as absent', () => {
        const uiad = JSON.parse(fixture('uiad-readback.json')) as { navigation: Record<string, unknown>; tiles: Record<string, unknown>[] };
        uiad.navigation['phone'] = false;
        uiad.tiles[0]!['isLegacy'] = false;
        expect(contentEquivalent('asuiad', JSON.stringify(uiad), fixture('uiad-readback.json'))).toEqual([true, null]);

        uiad.navigation['tablet'] = false;
        expect(contentEquivalent('asuiad', JSON.stringify(uiad), fixture('uiad-readback.json'))).toEqual([false, null]);
    });

    it('sees a real change', () => {
        const local = fixture('uist-put.json').replace('ZSNAP_BC_PAGE_TEST', 'ZSNAP_BC_PAGE_OTHER');
        expect(contentEquivalent('asuist', local, fixture('uist-readback.json'))).toEqual([false, null]);
    });

    it('applies rules to copies, leaving the inputs unchanged', () => {
        const local = { sections: [{ visualizations: [{ id: 'V', type: 'ladiAssignment', flag: false }] }] };
        const remote = { header: { description: 'D' }, sections: [{ visualizations: [{ id: 'V' }] }] };
        const before = JSON.stringify([local, remote]);

        const [ownedLocal, ownedRemote] = applyAffJsonRules(local, remote, OBJECT_CONFIG_MAP.asuipg.affJson!);

        expect(JSON.stringify([local, remote])).toBe(before);
        expect(ownedLocal).toEqual({ sections: [{ visualizations: [{ id: 'V' }] }] });
        expect(ownedRemote).toEqual({ sections: [{ visualizations: [{ id: 'V' }] }] });
    });

    it('ignores the tile assignment catalogType default on both sides', () => {
        const page = (catalogType?: string) => JSON.stringify({
            formatVersion: '1',
            header: { description: 'P', originalLanguage: 'en' },
            generalInformation: { title: 'P' },
            sections: [{ id: 'S', visualizations: [{ id: 'V', type: 'tileAssignment', tileAssignment: {
                tileKey: { catalogId: 'C', id: 'T', ...(catalogType ? { catalogType } : {}) },
                targetMappingKey: { catalogId: 'C', id: 'M', ...(catalogType ? { catalogType } : {}) },
            } }] }],
        });
        expect(contentEquivalent('asuipg', page('standard'), page())).toEqual([true, null]);
        expect(contentEquivalent('asuipg', page(), page('standard'))).toEqual([true, null]);
        expect(contentEquivalent('asuipg', page('custom'), page())).toEqual([false, null]);
    });

    it('checks nothing for a type without rules', () => {
        expect(requireAffJsonPaths('', OBJECT_CONFIG_MAP.asnrob.affJson, 'x')).toEqual([undefined, null]);
    });
});

describe('launchpad activation', () => {
    const RESULTS = `<?xml version="1.0" encoding="UTF-8"?><chkl:messages xmlns:chkl="http://www.sap.com/abapxml/checklist"><chkl:properties checkExecuted="true" activationExecuted="true" generationExecuted="true"/><msg objDescr="Launchpad Space Template ZSNAP_BC_SPACE_TEST" type="W" href="/sap/bc/adt/fiori/uisttop/zsnap_bc_space_test"><shortText><txt>Sort priority should not be initial</txt></shortText></msg></chkl:messages>`;

    function activationSap(): { requestor: AdtRequestor; calls: Call[] } {
        return recorder(call => {
            if (call.method === 'POST' && call.path.endsWith('/activation/runs')) {
                return new Response('', { status: 202, headers: { location: '/sap/bc/adt/activation/runs/R1' } });
            }
            if (call.path.includes('/activation/results/')) return new Response(RESULTS, { status: 200 });
            return new Response('', { status: 200 });
        });
    }

    it('skips an app descriptor item, which is saved active', async () => {
        const { requestor, calls } = activationSap();

        const [results, error] = await activateObjects(requestor, [{ name: 'ZSNAP_BC_UIAD_TEST', extension: 'asuiad' }]);

        expect(error).toBeNull();
        expect(calls).toHaveLength(0);
        expect(results![0]!.status).toBe('success');
    });

    it('activates pages and spaces through the run; a warning still counts as success', async () => {
        const { requestor, calls } = activationSap();

        const [results, error] = await activateObjects(requestor, [
            { name: 'ZSNAP_BC_PAGE_TEST', extension: 'asuipg' },
            { name: 'ZSNAP_BC_SPACE_TEST', extension: 'asuist' },
        ]);

        expect(error).toBeNull();
        const run = calls.find(c => c.method === 'POST' && c.path.endsWith('/activation/runs'))!;
        expect(run.body).toContain('adtcore:uri="/sap/bc/adt/fiori/uipgtyp/zsnap_bc_page_test" adtcore:type="UIPG/TYP" adtcore:name="ZSNAP_BC_PAGE_TEST"');
        expect(run.body).toContain('adtcore:uri="/sap/bc/adt/fiori/uisttop/zsnap_bc_space_test" adtcore:type="UIST/TOP" adtcore:name="ZSNAP_BC_SPACE_TEST"');
        expect(results!.map(r => r.status)).toEqual(['success', 'success']);
    });
});
