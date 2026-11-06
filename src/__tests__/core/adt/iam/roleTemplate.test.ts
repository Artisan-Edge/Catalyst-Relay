/**
 * Unit Tests for business role templates (SIA8), their catalog assignments (SIA9) and assignment naming
 *
 * Fixtures were captured on Madiba-Cloud-Dev (2608).
 */

import { describe, it, expect } from 'bun:test';
import { createCatalogAssignment } from '../../../../core/adt/iam/catalog';
import { nextAssignmentName } from '../../../../core/adt/iam/assignmentName';
import { parseRoleTemplate, readRoleTemplateCatalogs, createRoleTemplateCatalogAssignment } from '../../../../core/adt/iam/roleTemplate';
import { createRoleTemplate } from '../../../../client/methods/iam/createRoleTemplate';
import { fixture, IAM, recorder, STATE, xml } from './iamTestKit';
import type { Call, Reply } from './iamTestKit';

describe('business catalog assignment description', () => {
    it('defaults to "<app> in <catalog>", cut to 60 characters, or takes the caller\'s', async () => {
        const { requestor, calls } = recorder(() => xml('', 201));

        await createCatalogAssignment(requestor, 'Z'.repeat(30), 'A'.repeat(30), 'X_0001', 'ZP');
        await createCatalogAssignment(requestor, 'ZC', 'ZA', 'ZC_0001', 'ZP', undefined, 'Mine');

        expect(calls[0]!.body).toContain(`adtcore:description="${`${'A'.repeat(30)} in ${'Z'.repeat(30)}`.slice(0, 60)}"`);
        expect(calls[1]!.body).toContain('adtcore:description="Mine"');
    });
});

describe('role templates', () => {
    it('parses a role template', () => {
        const [template, error] = parseRoleTemplate(fixture('sia8.xml'), 'ZSNAP_BC_BRT_TEST');

        expect(error).toBeNull();
        expect(template).toEqual({ name: 'ZSNAP_BC_BRT_TEST', description: 'SNAP BC Test Role Template', packageName: 'ZSNAP_BC', scopeDependent: false, fioriSpaceId: '', catalogs: [] });
    });

    it('lists catalog assignments through $getsia9', async () => {
        const { requestor, calls } = recorder(() => xml(fixture('sia8-getsia9.xml')));

        const [catalogs, error] = await readRoleTemplateCatalogs(requestor, 'zsnap_bc_brt_test');

        expect(error).toBeNull();
        expect(catalogs).toEqual([{ assignment: 'ZSNAP_BC_BRT_TEST_0001', catalog: 'ZSNAP_BC_CAT_TEST' }]);
        expect(calls[0]).toMatchObject({ path: `${IAM}/sia8/$getsia9`, params: { name: 'ZSNAP_BC_BRT_TEST' } });
    });

    it('posts a SIA9 assignment like the captured body', async () => {
        const { requestor, calls } = recorder(() => xml('', 201));

        await createRoleTemplateCatalogAssignment(requestor, 'zsnap_bc_brt_test', 'zsnap_bc_cat_test', 'zsnap_bc_brt_test_0001', 'zsnap_bc', 'TR1');

        expect(calls[0]!.path).toBe(`${IAM}/sia9`);
        expect(calls[0]!.params).toEqual({ corrNr: 'TR1' });
        expect(calls[0]!.headers?.['Content-Type']).toBe('application/vnd.sap.adt.blues.v1+xml');
        expect(calls[0]!.body).toContain('adtcore:name="ZSNAP_BC_BRT_TEST_0001" adtcore:type="SIA9" adtcore:description="ZSNAP_BC_CAT_TEST"');
        expect(calls[0]!.body).toContain('<sia9:templateCatalogAssignmentID>ZSNAP_BC_BRT_TEST_0001</sia9:templateCatalogAssignmentID>');
        expect(calls[0]!.body).toContain('<sia9:businessRoleTemplateID>ZSNAP_BC_BRT_TEST</sia9:businessRoleTemplateID>');
        expect(calls[0]!.body).toContain('<sia9:businessCatalogID>ZSNAP_BC_CAT_TEST</sia9:businessCatalogID>');
    });

    it('numbers SIA9 assignments like SIA7', () => {
        expect(nextAssignmentName('zsnap_bc_brt_test', [{ assignment: 'ZSNAP_BC_BRT_TEST_0001', catalog: 'C' }])).toBe('ZSNAP_BC_BRT_TEST_0002');
    });

    // Role template double: absent until created; assignments accumulate.
    function templateEndpoint(initial: Array<[string, string]> | null, catalogs: string[]): { respond: (call: Call) => Reply } {
        let assignments = initial;
        const getsia9 = (): string => `<?xml version="1.0" encoding="utf-8"?><sia8:businessCatalogs xmlns:sia8="http://www.sap.com/iam/sia8">${(assignments ?? []).map(([id, catalog]) => `<sia8:businessCatalog><sia8:assignmentID>${id}</sia8:assignmentID><sia8:brtID>ZB</sia8:brtID><sia8:businessCatalogID>${catalog}</sia8:businessCatalogID></sia8:businessCatalog>`).join('')}</sia8:businessCatalogs>`;
        return {
            respond: (call) => {
                if (call.path.endsWith('/sia8/$getsia9')) return xml(getsia9());
                if (call.path.endsWith('/sia8/$publish')) return xml(fixture('publish-sia8.xml'));
                if (call.path.endsWith('/sia1/$bucapps')) return xml('<sia1:bucapps xmlns:sia1="http://www.sap.com/iam/sia1"/>');
                if (call.path.startsWith(`${IAM}/sia1/`)) {
                    const name = call.path.split('/').at(-1)!.toUpperCase();
                    return catalogs.includes(name) ? xml(`<sia1:sia1 xmlns:sia1="http://www.sap.com/iam/sia1" xmlns:adtcore="http://www.sap.com/adt/core" adtcore:name="${name}"><sia1:content/></sia1:sia1>`) : xml('', 404);
                }
                if (call.method === 'POST' && call.path === `${IAM}/sia8`) {
                    assignments = [];
                    return xml('', 201);
                }
                if (call.method === 'POST' && call.path === `${IAM}/sia9`) return xml('', 201);
                if (call.method === 'GET' && call.path.startsWith(`${IAM}/sia8/`)) return assignments ? xml(fixture('sia8.xml').replaceAll('ZSNAP_BC_BRT_TEST', 'ZB')) : xml('', 404);
                return xml('');
            },
        };
    }

    it('creates the template, assigns the catalog and publishes', async () => {
        const { respond } = templateEndpoint(null, ['ZC']);
        const { requestor, calls } = recorder(respond);

        const [result, error] = await createRoleTemplate(STATE, requestor, { templateName: 'zb', packageName: 'zsnap_bc', description: 'Test', transport: 'TR1', catalogs: ['zc'] });

        expect(error).toBeNull();
        expect(result).toEqual({ name: 'ZB', created: true, changed: true, descriptionUpdated: false, descriptionDiffers: false, assignmentsAdded: [{ assignment: 'ZB_0001', catalog: 'ZC' }], assignmentsFound: [], published: true, publishStatus: '', steps: { create: 'DONE', assign: 'DONE', publish: 'DONE' } });
        const create = calls.find(c => c.method === 'POST' && c.path === `${IAM}/sia8`)!;
        expect(create.params).toEqual({ corrNr: 'TR1' });
        expect(create.body).toContain('<sia8:brtID>ZB</sia8:brtID>');
        expect(create.body).toContain('<sia8:scopeDependent>false</sia8:scopeDependent>');
        expect(create.body).toContain('adtcore:description="Test"');
    });

    it('skips an assigned catalog on a re-run and still publishes', async () => {
        const { respond } = templateEndpoint([['ZB_0001', 'ZC']], ['ZC']);
        const { requestor, calls } = recorder(respond);

        const [result] = await createRoleTemplate(STATE, requestor, { templateName: 'ZB', packageName: 'ZSNAP_BC', description: 'x', catalogs: ['ZC'] });

        expect(result?.steps).toEqual({ create: 'SKIPPED', assign: 'SKIPPED', publish: 'DONE' });
        expect(calls.some(c => c.path === `${IAM}/sia9`)).toBe(false);
    });

    it('checks every catalog before writing anything (no template, no assignment)', async () => {
        const { respond } = templateEndpoint(null, ['ZC']);
        const { requestor, calls } = recorder(respond);

        const [, error] = await createRoleTemplate(STATE, requestor, { templateName: 'ZB', packageName: 'ZSNAP_BC', description: 'x', catalogs: ['ZC', 'ZTYPO'], publish: false });

        expect(error?.message).toBe('Business catalog ZTYPO does not exist');
        expect(calls.some(c => c.method === 'POST')).toBe(false);
    });

    it('takes the next assignment number when SAP says the name already exists', async () => {
        const { respond } = templateEndpoint([], ['ZC']);
        let attempts = 0;
        const { requestor, calls } = recorder((call) => {
            if (call.method === 'POST' && call.path === `${IAM}/sia9` && attempts++ < 2) return xml('<exc:exception xmlns:exc="x"><localizedMessage>ZB_000x already exists</localizedMessage></exc:exception>', 400);
            return respond(call);
        });

        const [result, error] = await createRoleTemplate(STATE, requestor, { templateName: 'ZB', packageName: 'ZSNAP_BC', description: 'x', catalogs: ['ZC'], publish: false });

        expect(error).toBeNull();
        expect(result?.assignmentsAdded).toEqual([{ assignment: 'ZB_0003', catalog: 'ZC' }]);
        expect(calls.filter(c => c.path === `${IAM}/sia9`).map(c => /adtcore:name="([^"]+)"/.exec(c.body ?? '')?.[1])).toEqual(['ZB_0001', 'ZB_0002', 'ZB_0003']);
    });

    it('gives up after a few taken names', async () => {
        const { respond } = templateEndpoint([], ['ZC']);
        const { requestor } = recorder((call) => call.method === 'POST' && call.path === `${IAM}/sia9` ? xml('<exc:exception xmlns:exc="x"><localizedMessage>already exists</localizedMessage></exc:exception>', 400) : respond(call));

        const [, error] = await createRoleTemplate(STATE, requestor, { templateName: 'ZB', packageName: 'ZSNAP_BC', description: 'x', catalogs: ['ZC'], publish: false });

        expect(error?.message).toContain('already exists');
    });
});
