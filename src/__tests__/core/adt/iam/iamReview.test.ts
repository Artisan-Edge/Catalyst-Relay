/**
 * Unit Tests for the chunk B review fixes: migration guard (customer EXT only), package and
 * description handling, ui5AppId replacement, re-check under the lock, assignment races and
 * listing roots, escaping and name limits, exact SWB_TOOL 029, partial results with publishError,
 * changed flags, the overall deadline, and service binding re-activation
 *
 * Fixtures were captured on Madiba-Cloud-Dev (2608).
 */

import { describe, it, expect } from 'bun:test';
import { createIamAppObject, needsMigration, parseIamApp } from '../../../../core/adt/iam/app';
import { createBusinessCatalogObject, readBusinessCatalog } from '../../../../core/adt/iam/catalog';
import { readRoleTemplate } from '../../../../core/adt/iam/roleTemplate';
import { isStillAssigned } from '../../../../core/adt/iam/delete';
import { iamObjectPath } from '../../../../core/adt/iam/helpers';
import { createNumberedAssignment } from '../../../../core/adt/iam/assignmentName';
import { IamPublishError } from '../../../../core/adt/iam/publish';
import { createIamApp } from '../../../../client/methods/iam/createIamApp';
import { createBusinessCatalog } from '../../../../client/methods/iam/createBusinessCatalog';
import { createRoleTemplate } from '../../../../client/methods/iam/createRoleTemplate';
import { activateServiceBinding } from '../../../../client/methods/craud/specialcases/businessservices/activateServiceBinding';
import { appEndpoint, fixture, freshApp, IAM, LOCK, publishing, recorder, STATE, xml } from './iamTestKit';
import type { Call, Reply } from './iamTestKit';

const SAP_APP_FIXTURES = ['sia6-sap-f1068_tran.xml', 'sia6-sap-wda0182_tran.xml', 'sia6-ibs.xml', 'sia6-yy1-cap.xml', 'sia6-yy1-aqwg.xml'];
const BUCAPPS_EMPTY = '<sia1:bucapps xmlns:sia1="http://www.sap.com/iam/sia1"/>';
const bucapps = (rows: Array<[string, string]>): string => `<sia1:bucapps xmlns:sia1="http://www.sap.com/iam/sia1">${rows.map(([id, app]) => `<sia1:bucapp><sia1:businessCatalogAppAssignmentID>${id}</sia1:businessCatalogAppAssignmentID><sia1:appID>${app}</sia1:appID></sia1:bucapp>`).join('')}</sia1:bucapps>`;
const catalogDoc = (name: string, pkg: string, description = 'Catalog'): string => `<sia1:sia1 xmlns:sia1="http://www.sap.com/iam/sia1" xmlns:adtcore="http://www.sap.com/adt/core" adtcore:name="${name}" adtcore:description="${description}"><adtcore:packageRef adtcore:name="${pkg}"/><sia1:content><sia1:publishStatus>p</sia1:publishStatus></sia1:content></sia1:sia1>`;
const writes = (calls: Call[]): Call[] => calls.filter(call => call.method === 'PUT' || call.method === 'DELETE' || call.params?.['_action'] === 'LOCK' || (call.method === 'POST' && !call.path.includes('$') && !call.path.endsWith('/publish')));

describe('migration guard', () => {
    it('never migrates SAP, IBS or key-user apps (empty migrationStatus)', () => {
        for (const name of SAP_APP_FIXTURES) {
            const [app, error] = parseIamApp(fixture(name), name);
            expect(error).toBeNull();
            expect(app?.migrationStatus).toBe('');
            expect(needsMigration(app!)).toBe(false);
        }
    });

    it('migrates a customer EXT app with an empty migrationStatus', () => {
        const [app] = parseIamApp(fixture('sia6-unmigrated.xml'), 'ZSNAP_BC_IAM_TEST_EXT');

        expect(needsMigration(app!)).toBe(true);
    });

    it('assigns an SAP app to a catalog without locking or writing it', async () => {
        const { requestor, calls } = recorder((call) => {
            if (call.path.endsWith('/sia6/f1068_tran')) return xml(fixture('sia6-sap-f1068_tran.xml'));
            if (call.path.endsWith('/$bucapps')) return xml(BUCAPPS_EMPTY);
            if (call.method === 'GET') return xml(catalogDoc('ZC', 'ZSNAP_BC'));
            return xml('', 201);
        });

        const [result, error] = await createBusinessCatalog(STATE, requestor, { catalogName: 'ZC', packageName: 'ZSNAP_BC', description: 'Catalog', apps: ['F1068_TRAN'], publish: false });

        expect(error).toBeNull();
        expect(result?.appsMigrated).toEqual([]);
        expect(calls.some(call => call.path.includes('/sia6/') && (call.method === 'PUT' || call.params?.['_action'] === 'LOCK'))).toBe(false);
        expect(result?.assignmentsAdded).toEqual([{ assignment: 'ZC_0001', app: 'F1068_TRAN' }]);
    });
});

describe('existing objects', () => {
    it('refuses an IAM app, catalog or role template in another package, before any write', async () => {
        const app = recorder(appEndpoint(fixture('sia6-lean2.xml'), ''));
        const catalog = recorder((call) => call.path.endsWith('/$bucapps') ? xml(BUCAPPS_EMPTY) : xml(catalogDoc('ZC', 'ZSNAP_BC')));
        const template = recorder((call) => call.path.endsWith('/$getsia9') ? xml(fixture('sia8-getsia9.xml')) : xml(fixture('sia8.xml')));

        const [, appErr] = await createIamApp(STATE, app.requestor, { appName: 'ZSNAP_BC_LEAN2_EXT', packageName: 'zother', description: 'x', services: [] });
        const [, catalogErr] = await createBusinessCatalog(STATE, catalog.requestor, { catalogName: 'ZC', packageName: 'ZOTHER', description: 'x', apps: [] });
        const [, templateErr] = await createRoleTemplate(STATE, template.requestor, { templateName: 'ZSNAP_BC_BRT_TEST', packageName: 'ZOTHER', description: 'x', catalogs: [] });

        expect(appErr?.message).toBe('IAM app ZSNAP_BC_LEAN2_EXT already exists in package ZSNAP_BC, not ZOTHER; use that package or another name');
        expect(catalogErr?.message).toContain('business catalog ZC already exists in package ZSNAP_BC, not ZOTHER');
        expect(templateErr?.message).toContain('business role template ZSNAP_BC_BRT_TEST already exists in package ZSNAP_BC, not ZOTHER');
        expect(writes([...app.calls, ...catalog.calls, ...template.calls])).toEqual([]);
    });

    it('keeps an existing description and reports that it differs; reports the ui5AppId it replaced', async () => {
        const { requestor, calls } = recorder(appEndpoint(fixture('sia6-lean2.xml'), ''));

        const [result, error] = await createIamApp(STATE, requestor, { appName: 'ZSNAP_BC_LEAN2_EXT', packageName: 'ZSNAP_BC', description: 'Another text', services: [], ui5AppId: 'znew_uiad' });

        expect(error).toBeNull();
        expect(result).toMatchObject({ created: false, changed: true, descriptionUpdated: false, descriptionDiffers: true, ui5AppId: 'ZNEW_UIAD', ui5AppIdReplaced: 'ZSNAP_BC_UIAD_LEAN2' });
        const put = calls.find(call => call.method === 'PUT')!;
        expect(put.body).toContain('<sia6:ui5AppId>ZNEW_UIAD</sia6:ui5AppId>');
        expect(put.body).toContain('adtcore:description="SNAP BC Lean Q02 IAM App"');
    });

    it('re-checks under the lock: what another session saved meanwhile is not written again', async () => {
        let gets = 0;
        const { requestor, calls } = recorder((call) => {
            if (call.params?.['_action'] === 'LOCK') return xml(LOCK);
            if (call.params?.['_action'] === 'UNLOCK') return xml('');
            if (call.path.endsWith('/service/detail')) return xml(fixture('sia6-servicedetail-ina1.xml'));
            if (call.path.endsWith('/sia6/publish')) return xml(fixture('publish-sia6.xml'));
            // First read: no service, no ui5AppId. Read under the lock: both present.
            if (call.method === 'GET') return xml(gets++ === 0 ? freshApp('ZSNAP_BC_LEAN2_EXT') : fixture('sia6-lean2.xml'));
            return xml('');
        });

        const [result, error] = await createIamApp(STATE, requestor, { appName: 'ZSNAP_BC_LEAN2_EXT', packageName: 'ZSNAP_BC', description: 'SNAP BC Lean Q02 IAM App', services: [{ name: 'ZSNAP_BC_MDA_SB', type: 'INA1' }], ui5AppId: 'ZSNAP_BC_UIAD_LEAN2' });

        expect(error).toBeNull();
        expect(calls.some(call => call.method === 'PUT')).toBe(false);
        expect(result).toMatchObject({ changed: false, servicesAdded: [], ui5AppIdReplaced: null, steps: { services: 'SKIPPED', ui5AppId: 'SKIPPED' } });
    });

    it('trims names', async () => {
        const { requestor, calls } = recorder(appEndpoint(null, freshApp('ZB_EXT')));

        const [result] = await createIamApp(STATE, requestor, { appName: ' zb_ext ', packageName: ' zsnap_bc ', description: 'x', services: [], publish: false });

        expect(result?.name).toBe('ZB_EXT');
        expect(calls[0]!.path).toBe(`${IAM}/sia6/zb_ext`);
        expect(calls.find(call => call.method === 'POST')!.body).toContain('<adtcore:packageRef adtcore:name="ZSNAP_BC"/>');
    });
});

describe('assignment races and listings', () => {
    it('returns the assignment another session made when SAP says the name exists', async () => {
        let listed: Array<[string, string]> = [];
        const { requestor, calls } = recorder((call) => {
            if (call.path.endsWith('/sia6/zb_ext')) return xml(freshApp('ZB_EXT'));
            if (call.path.endsWith('/$bucapps')) return xml(bucapps(listed));
            if (call.method === 'POST' && call.path === `${IAM}/sia7`) {
                listed = [['ZC_0001', 'ZB_EXT']];
                return xml('<exc:exception xmlns:exc="x"><message>Object ZC_0001 already exists</message></exc:exception>', 400);
            }
            if (call.method === 'GET') return xml(catalogDoc('ZC', 'ZSNAP_BC'));
            return xml('', 201);
        });

        const [result, error] = await createBusinessCatalog(STATE, requestor, { catalogName: 'ZC', packageName: 'ZSNAP_BC', description: 'Catalog', apps: ['ZB_EXT'], publish: false });

        expect(error).toBeNull();
        expect(result).toMatchObject({ assignmentsAdded: [], assignmentsFound: [{ assignment: 'ZC_0001', app: 'ZB_EXT' }], changed: false });
        expect(calls.filter(call => call.method === 'POST' && call.path === `${IAM}/sia7`)).toHaveLength(1);
    });

    it('tries the next name when the re-list does not show the target', async () => {
        const created: string[] = [];
        const [made, error] = await createNumberedAssignment('ZC', [], async (name) => {
            created.push(name);
            return created.length === 1 ? [null, new Error('ZC_0001 already exists')] : [undefined, null];
        }, async () => [null, null]);

        expect(error).toBeNull();
        expect(made).toEqual({ assignment: 'ZC_0002', created: true });
    });

    it('fails on a $bucapps or $getsia9 200 that is not a listing (e.g. a logon page)', async () => {
        const catalog = recorder((call) => call.path.endsWith('/$bucapps') ? xml('<html><body>Logon</body></html>') : xml(catalogDoc('ZC', 'ZSNAP_BC')));
        const template = recorder((call) => call.path.endsWith('/$getsia9') ? xml('<html><body>Logon</body></html>') : xml(fixture('sia8.xml')));

        const [, catalogErr] = await readBusinessCatalog(catalog.requestor, 'ZC');
        const [, templateErr] = await readRoleTemplate(template.requestor, 'ZSNAP_BC_BRT_TEST');

        expect(catalogErr?.message).toBe('Failed to list the apps of business catalog ZC: unexpected response (root html, expected bucapps)');
        expect(templateErr?.message).toBe('Failed to list the catalogs of business role template ZSNAP_BC_BRT_TEST: unexpected response (root html, expected businessCatalogs)');
    });
});

describe('request safety', () => {
    it('escapes names, packages and descriptions, and cuts SIA6/SIA1 descriptions to 60', async () => {
        const { requestor, calls } = recorder(() => xml(freshApp('ZA'), 201));

        await createIamAppObject(requestor, 'ZA', 'Z&P', `A & B <c> "d" ${'x'.repeat(80)}`);
        await createBusinessCatalogObject(requestor, 'ZC', 'ZP', 'y'.repeat(80));

        expect(calls[0]!.body).toContain('adtcore:description="A &amp; B &lt;c&gt; &quot;d&quot; ');
        expect(calls[0]!.body).toContain('<adtcore:packageRef adtcore:name="Z&amp;P"/>');
        expect(calls[0]!.body).not.toContain('x'.repeat(60));
        expect(calls[1]!.body).toContain(`adtcore:description="${'y'.repeat(60)}"`);
    });

    it('encodes namespaced names in object paths', () => {
        expect(iamObjectPath('sia6', '/ABC/ZAPP_EXT')).toBe(`${IAM}/sia6/%2Fabc%2Fzapp_ext`);
    });

    it('refuses a role template name with no room for _NNNN before creating anything', async () => {
        const { requestor, calls } = recorder((call) => call.path.startsWith(`${IAM}/sia1/`) ? xml(call.path.endsWith('$bucapps') ? BUCAPPS_EMPTY : catalogDoc('ZC', 'ZSNAP_BC')) : xml('', 404));

        const [, error] = await createRoleTemplate(STATE, requestor, { templateName: 'Z'.repeat(26), packageName: 'ZSNAP_BC', description: 'x', catalogs: ['ZC'] });

        expect(error?.message).toContain('at most 25');
        expect(calls.some(call => call.method === 'POST')).toBe(false);
    });

    it('matches SWB_TOOL 029 exactly', () => {
        const other = '<exc:exception xmlns:exc="x"><message>Prerequisites for deleting ZAPP_0290_EXT are not fulfilled</message><properties><entry key="T100KEY-ID">SWB_TOOL</entry><entry key="T100KEY-NO">050</entry><entry key="T100KEY-V1">ZAPP_0290_EXT</entry></properties></exc:exception>';

        expect(isStillAssigned(fixture('delete-sia6-still-assigned.xml'))).toBe(true);
        expect(isStillAssigned(other)).toBe(false);
        expect(isStillAssigned('<html>SWB_TOOL 029</html>')).toBe(false);
    });
});

describe('results for fiori deploy', () => {
    function publishingApp(publishReply: () => Reply): (call: Call) => Reply {
        const base = appEndpoint(null, freshApp('ZB_EXT'));
        return (call) => call.path.endsWith('/sia6/publish') ? publishReply() : base(call);
    }

    it('keeps the create result and reports a failed publish as publishError', async () => {
        const { requestor } = recorder(publishingApp(() => xml(publishing('sia6', 'x'))));

        const [result, error] = await createIamApp(STATE, requestor, { appName: 'ZB_EXT', packageName: 'ZSNAP_BC', description: 'x', services: [] });

        expect(error).toBeNull();
        expect(result).toMatchObject({ created: true, changed: true, published: false, steps: { create: 'DONE', publish: 'SKIPPED' } });
        expect(result?.publishError).toBeInstanceOf(IamPublishError);
        expect(result?.publishError).toMatchObject({ failure: 'status', pending: false, lastStatus: 'x' });
    });

    it('lets the publish wait use only what is left of deadlineMs (pending, timed out)', async () => {
        const { requestor, calls } = recorder(publishingApp(() => xml(fixture('publish-sia6.xml'))));

        const [result] = await createIamApp(STATE, requestor, { appName: 'ZB_EXT', packageName: 'ZSNAP_BC', description: 'x', services: [], deadlineMs: 60_000 });

        expect(calls.some(call => call.path.endsWith('/sia6/publish'))).toBe(false);
        expect(result?.publishError).toMatchObject({ pending: true, timedOut: true });
        expect(result?.created).toBe(true);
    });

    it('reports changed false on a re-run that writes nothing', async () => {
        const { requestor } = recorder(appEndpoint(fixture('sia6-lean2.xml'), ''));

        const [result] = await createIamApp(STATE, requestor, { appName: 'ZSNAP_BC_LEAN2_EXT', packageName: 'ZSNAP_BC', description: 'SNAP BC Lean Q02 IAM App', services: [{ name: 'ZSNAP_BC_MDA_SB', type: 'INA1' }], publish: false });

        expect(result).toMatchObject({ changed: false, descriptionDiffers: false });
    });

    it('re-activates a service binding by name (client.activate cannot address SRVB)', async () => {
        const { requestor, calls } = recorder(() => xml('<chkl:messages xmlns:chkl="http://www.sap.com/abapxml/checklist"/>'));

        await activateServiceBinding(STATE, requestor, ' zsnap_bc_cli_sb ');

        expect(calls[0]!.path).toBe('/sap/bc/adt/activation/runs');
        expect(calls[0]!.body).toContain('adtcore:uri="/sap/bc/adt/businessservices/bindings/zsnap_bc_cli_sb"');
        expect(calls[0]!.body).toContain('adtcore:type="SRVB/SVB"');
        expect(calls[0]!.body).toContain('adtcore:name="ZSNAP_BC_CLI_SB"');
    });
});
