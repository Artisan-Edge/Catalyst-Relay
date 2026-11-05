/**
 * Unit Tests for IAM apps — INA1 services, ui5AppId, the migration guard, one full-document PUT per run, IWSV rows, delete
 *
 * Fixtures were captured on Madiba-Cloud-Dev (2608).
 */

import { describe, it, expect } from 'bun:test';
import { parseIamApp, applyIamAppChanges, resolveIamServices, ensureIamAppMigrated } from '../../../../core/adt/iam/app';
import { deleteIamObject } from '../../../../core/adt/iam/delete';
import { isServiceListed } from '../../../../core/adt/iam/serviceName';
import { createIamApp } from '../../../../client/methods/iam/createIamApp';
import { appEndpoint, fixture, freshApp, IAM, LOCK, recorder, STATE, xml } from './iamTestKit';

describe('IAM app read', () => {
    it('reads ui5AppId, the INA1 service and migrationStatus', () => {
        const [app, error] = parseIamApp(fixture('sia6-lean2.xml'), 'ZSNAP_BC_LEAN2_EXT');

        expect(error).toBeNull();
        expect(app?.ui5AppId).toBe('ZSNAP_BC_UIAD_LEAN2');
        expect(app?.migrationStatus).toBe('3');
        expect(app?.services).toEqual([{ name: 'ZSNAP_BC_MDA_SB', version: '', type: 'INA1', typeText: 'InA (Information Access) - UI', description: 'Service Binding for ZSNAP_BC_MDA_SD', runtimeType: 'HT', runtimeName: 'F0FE23D9BC234310E448AAE3C93A1E' }]);
    });

    it('reads an empty migrationStatus and ui5AppId', () => {
        const [app] = parseIamApp(fixture('sia6-unmigrated.xml'), 'ZSNAP_BC_IAM_TEST_EXT');

        expect(app?.migrationStatus).toBe('');
        expect(app?.ui5AppId).toBe('');
    });
});

describe('INA1 services', () => {
    it('resolves an InA binding through the service detail directly', async () => {
        const { requestor, calls } = recorder(() => xml(fixture('sia6-servicedetail-ina1.xml')));

        const [rows, error] = await resolveIamServices(requestor, 'zsnap_bc_lean2_ext', [{ name: 'zsnap_bc_mda_sb', type: 'INA1' }]);

        expect(error).toBeNull();
        expect(calls).toHaveLength(1);
        expect(calls[0]!.path).toBe(`${IAM}/sia6/service/detail`);
        expect(calls[0]!.params).toEqual({ serviceName: 'ZSNAP_BC_MDA_SB', serviceType: 'INA1', appName: 'ZSNAP_BC_LEAN2_EXT' });
        expect(calls[0]!.headers?.['Accept']).toBe('application/vnd.sap.adt.iam.servicedetail+xml');
        expect(rows?.[0]).toMatchObject({ srvcType: 'HT', srvcName: 'F0FE23D9BC234310E448AAE3C93A1E', relServiceName: 'ZSNAP_BC_MDA_SB', relServiceType: 'INA1', typeText: 'InA (Information Access) - UI' });
    });

    it('fails clearly when the binding has no INA1 service', async () => {
        const empty = fixture('sia6-servicedetail-ina1.xml').replace('<sia6:srvcName>F0FE23D9BC234310E448AAE3C93A1E</sia6:srvcName>', '<sia6:srvcName/>');
        const { requestor } = recorder(() => xml(empty));

        const [, error] = await resolveIamServices(requestor, 'ZA', [{ name: 'ZSNAP_BC_NOPE', type: 'INA1' }]);

        expect(error?.message).toContain('InA service binding ZSNAP_BC_NOPE has no INA1 service');
    });
});

describe('applyIamAppChanges', () => {
    it('sets ui5AppId and migrationStatus on empty elements and appends the INA1 row', () => {
        const [detailRow] = [{ srvcType: 'HT', srvcName: 'F0FE', relServiceName: 'ZSB', relServiceType: 'INA1', typeText: 'InA', srvcDescription: 'd', uiadSource: '', transactionCodeSource: '' }];
        const [body, error] = applyIamAppChanges(fixture('sia6-unmigrated.xml'), { services: [detailRow!], ui5AppId: 'ZUIAD', migrationStatus: '3' });

        expect(error).toBeNull();
        expect(body).toContain('<sia6:ui5AppId>ZUIAD</sia6:ui5AppId>');
        expect(body).toContain('<sia6:migrationStatus>3</sia6:migrationStatus>');
        expect(body).toContain('<sia6:relServiceName>ZSB</sia6:relServiceName><sia6:relServiceType>INA1</sia6:relServiceType>');
        expect(body).not.toContain('atom:link');
    });

    it('replaces an existing ui5AppId', () => {
        const [body] = applyIamAppChanges(fixture('sia6-lean2.xml'), { ui5AppId: 'ZOTHER' });

        expect(body).toContain('<sia6:ui5AppId>ZOTHER</sia6:ui5AppId>');
        expect(body).not.toContain('ZSNAP_BC_UIAD_LEAN2');
    });

    it('inserts a missing ui5AppId after appType but never a missing migrationStatus', () => {
        const minimal = '<sia6:sia6 xmlns:sia6="http://www.sap.com/iam/sia6"><sia6:content><sia6:appID>ZA</sia6:appID><sia6:appType>EXT</sia6:appType><sia6:services/></sia6:content></sia6:sia6>';

        const [body] = applyIamAppChanges(minimal, { ui5AppId: 'ZUIAD', migrationStatus: '3' });

        expect(body).toContain('<sia6:appType>EXT</sia6:appType><sia6:ui5AppId>ZUIAD</sia6:ui5AppId><sia6:services/></sia6:content>');
        expect(body).not.toContain('migrationStatus');
    });
});

describe('ensureIamAppMigrated', () => {
    it('PUTs migrationStatus 3 on an app without one', async () => {
        const { requestor, calls } = recorder(appEndpoint(fixture('sia6-unmigrated.xml'), ''));

        const [migrated, error] = await ensureIamAppMigrated(requestor, 'ZSNAP_BC_IAM_TEST_EXT', 'TR1');

        expect(error).toBeNull();
        expect(migrated).toBe(true);
        const put = calls.find(c => c.method === 'PUT')!;
        expect(put.params).toEqual({ lockHandle: 'H1', corrNr: 'TR1' });
        expect(put.body).toContain('<sia6:migrationStatus>3</sia6:migrationStatus>');
        expect(calls.at(-1)!.params).toMatchObject({ _action: 'UNLOCK' });
    });

    it('does nothing on a migrated app', async () => {
        const { requestor, calls } = recorder(appEndpoint(fixture('sia6-lean2.xml'), ''));

        const [migrated, error] = await ensureIamAppMigrated(requestor, 'ZSNAP_BC_LEAN2_EXT');

        expect(error).toBeNull();
        expect(migrated).toBe(false);
        expect(calls.some(c => c.params?.['_action'] === 'LOCK')).toBe(false);
    });
});

describe('ensureIamAppMigrated without the element', () => {
    it('leaves an app whose document has no migrationStatus element alone', async () => {
        const noElement = fixture('sia6-unmigrated.xml').replace('<sia6:migrationStatus/>', '');
        const { requestor, calls } = recorder(appEndpoint(noElement, ''));

        const [migrated, error] = await ensureIamAppMigrated(requestor, 'ZSNAP_BC_IAM_TEST_EXT');

        expect(error).toBeNull();
        expect(migrated).toBe(false);
        expect(parseIamApp(noElement, 'X')[0]?.migrationStatus).toBeNull();
        expect(calls.some(c => c.params?.['_action'] === 'LOCK')).toBe(false);
    });
});

describe('IWSV rows (SAP pads the name with the version)', () => {
    const PADDED = '<sia6:service><sia6:srvcType>HT</sia6:srvcType><sia6:srvcName>X1</sia6:srvcName><sia6:relServiceName>APJ_JOB_MANAGEMENT_SRV             0001</sia6:relServiceName><sia6:relServiceType>IWSV</sia6:relServiceType><sia6:typeText>OData V2</sia6:typeText><sia6:srvcDescription/><sia6:uiadSource/><sia6:transactionCodeSource/></sia6:service>';
    const withV2 = (): string => freshApp('ZV2_EXT').replace('<sia6:services/>', `<sia6:services>${PADDED}</sia6:services>`);

    it('reads the name and version apart', () => {
        const [app] = parseIamApp(withV2(), 'ZV2_EXT');

        expect(app?.services[0]).toMatchObject({ name: 'APJ_JOB_MANAGEMENT_SRV', version: '0001', type: 'IWSV' });
    });

    it('does not add a listed V2 service again on a re-run (default version 0001)', async () => {
        const { requestor, calls } = recorder(appEndpoint(withV2(), ''));

        const [result, error] = await createIamApp(STATE, requestor, { appName: 'ZV2_EXT', packageName: 'ZSNAP_BC', description: 'd', services: [{ name: 'apj_job_management_srv', type: 'IWSV' }], publish: false });

        expect(error).toBeNull();
        expect(result?.steps.services).toBe('SKIPPED');
        expect(calls.some(c => c.method === 'PUT' || c.path.endsWith('/service/values'))).toBe(false);
    });

    it('does add another version of a listed V2 service', () => {
        const [app] = parseIamApp(withV2(), 'ZV2_EXT');

        expect(isServiceListed(app!.services, { name: 'APJ_JOB_MANAGEMENT_SRV', type: 'IWSV', version: '0002' })).toBe(false);
        expect(isServiceListed(app!.services, { name: 'APJ_JOB_MANAGEMENT_SRV', type: 'IWSV', version: '0001' })).toBe(true);
        expect(isServiceListed(app!.services, { name: 'APJ_JOB_MANAGEMENT_SRV', type: 'G4BA' })).toBe(false);
    });
});

describe('createIamApp with INA1 and ui5AppId', () => {
    const options = { appName: 'zsnap_bc_cli_ext', packageName: 'ZSNAP_BC', description: 'd', services: [{ name: 'ZSNAP_BC_MDA_SB', type: 'INA1' as const }], ui5AppId: 'zsnap_bc_uiad_lean2' };

    it('creates, saves service, ui5AppId and migration in one PUT, and publishes', async () => {
        const { requestor, calls } = recorder(appEndpoint(null, freshApp('ZSNAP_BC_CLI_EXT', '')));

        const [result, error] = await createIamApp(STATE, requestor, options);

        expect(error).toBeNull();
        expect(result).toEqual({
            name: 'ZSNAP_BC_CLI_EXT', created: true, servicesAdded: ['ZSNAP_BC_MDA_SB'], ui5AppId: 'ZSNAP_BC_UIAD_LEAN2', migrated: true, published: true, publishStatus: 'p',
            steps: { create: 'DONE', services: 'DONE', ui5AppId: 'DONE', migration: 'DONE', publish: 'DONE' },
        });
        const puts = calls.filter(c => c.method === 'PUT');
        expect(puts).toHaveLength(1);
        expect(puts[0]!.body).toContain('<sia6:ui5AppId>ZSNAP_BC_UIAD_LEAN2</sia6:ui5AppId>');
        expect(puts[0]!.body).toContain('<sia6:relServiceType>INA1</sia6:relServiceType>');
        expect(puts[0]!.body).toContain('<sia6:migrationStatus>3</sia6:migrationStatus>');
        expect(calls.find(c => c.path.endsWith('/sia6/publish'))!.timeout).toBe(300_000);
    });

    it('trusts a read over the create response, which shows migrationStatus empty', async () => {
        const { requestor, calls } = recorder(appEndpoint(null, freshApp('ZSNAP_BC_CLI_EXT', ''), freshApp('ZSNAP_BC_CLI_EXT', '3')));

        const [result] = await createIamApp(STATE, requestor, { ...options, publish: false });

        expect(result?.migrated).toBe(false);
        expect(result?.steps.migration).toBe('SKIPPED');
        expect(calls.find(c => c.method === 'PUT')!.body).toContain('<sia6:migrationStatus>3</sia6:migrationStatus>');
    });

    it('skips the save on a re-run when service, ui5AppId and migration already match', async () => {
        const { requestor, calls } = recorder(appEndpoint(fixture('sia6-lean2.xml'), ''));

        const [result, error] = await createIamApp(STATE, requestor, { ...options, appName: 'ZSNAP_BC_LEAN2_EXT' });

        expect(error).toBeNull();
        expect(result?.steps).toEqual({ create: 'SKIPPED', services: 'SKIPPED', ui5AppId: 'SKIPPED', migration: 'SKIPPED', publish: 'DONE' });
        expect(result?.ui5AppId).toBe('ZSNAP_BC_UIAD_LEAN2');
        expect(calls.some(c => c.method === 'PUT' || c.params?.['_action'] === 'LOCK')).toBe(false);
    });

    it('replaces a different ui5AppId only', async () => {
        const { requestor, calls } = recorder(appEndpoint(fixture('sia6-lean2.xml'), ''));

        const [result] = await createIamApp(STATE, requestor, { ...options, appName: 'ZSNAP_BC_LEAN2_EXT', ui5AppId: 'ZSNAP_BC_UIAD_OTHER', publish: false });

        expect(result?.steps).toEqual({ create: 'SKIPPED', services: 'SKIPPED', ui5AppId: 'DONE', migration: 'SKIPPED', publish: 'SKIPPED' });
        expect(calls.find(c => c.method === 'PUT')!.body).toContain('<sia6:ui5AppId>ZSNAP_BC_UIAD_OTHER</sia6:ui5AppId>');
        expect(calls.some(c => c.path.endsWith('/service/detail'))).toBe(false);
    });
});

describe('deleteIamObject', () => {
    it('locks, deletes and unlocks', async () => {
        const { requestor, calls } = recorder((call) => call.params?.['_action'] === 'LOCK' ? xml(LOCK) : xml(''));

        const [, error] = await deleteIamObject(requestor, 'sia9', 'zb_0001', 'TR1');

        expect(error).toBeNull();
        expect(calls.map(c => [c.method, c.path, c.params?.['_action'] ?? ''])).toEqual([
            ['POST', `${IAM}/sia9/zb_0001`, 'LOCK'],
            ['DELETE', `${IAM}/sia9/zb_0001`, ''],
            ['POST', `${IAM}/sia9/zb_0001`, 'UNLOCK'],
        ]);
        expect(calls[1]!.params).toEqual({ lockHandle: 'H1', corrNr: 'TR1' });
    });

    it('names the catalogs of an IAM app that is still assigned (SWB_TOOL 029)', async () => {
        const usage = '<usagereferences:usageReferenceResult xmlns:usagereferences="http://www.sap.com/adt/ris/usageReferences"><usagereferences:referencedObjects><usagereferences:referencedObject><usagereferences:adtObject adtcore:name="ZSNAP_BC_CAT_TEST" adtcore:type="SIA1" xmlns:adtcore="http://www.sap.com/adt/core"/></usagereferences:referencedObject><usagereferences:referencedObject><usagereferences:adtObject adtcore:name="ZSNAP_BC" adtcore:type="DEVC/K" xmlns:adtcore="http://www.sap.com/adt/core"/></usagereferences:referencedObject></usagereferences:referencedObjects></usagereferences:usageReferenceResult>';
        const { requestor, calls } = recorder((call) => {
            if (call.params?.['_action'] === 'LOCK') return xml(LOCK);
            if (call.method === 'DELETE') return xml(fixture('delete-sia6-still-assigned.xml'), 400);
            if (call.path.endsWith('/usageReferences')) return xml(usage);
            return xml('');
        });

        const [, error] = await deleteIamObject(requestor, 'sia6', 'ZSNAP_BC_DEL_EXT');

        expect(error?.message).toBe('Cannot delete IAM app ZSNAP_BC_DEL_EXT: it is still assigned to a business catalog (ZSNAP_BC_CAT_TEST); remove the app from its business catalogs first (delete the SIA7 assignments)');
        expect(calls.some(c => c.params?.['_action'] === 'UNLOCK')).toBe(true);
    });

    it('passes other delete errors through', async () => {
        const { requestor } = recorder((call) => call.params?.['_action'] === 'LOCK' ? xml(LOCK) : call.method === 'DELETE' ? xml(fixture('delete-sia6-still-assigned.xml'), 400) : xml(''));

        const [, error] = await deleteIamObject(requestor, 'sia1', 'ZC');

        expect(error?.message).toBe('Failed to delete business catalog ZC: Error while deleting object App from the database');
    });
});
