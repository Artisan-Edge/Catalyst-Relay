/**
 * Unit Tests for Cloud IAM — IAM apps (SIA6), business catalogs (SIA1) and assignments (SIA7)
 *
 * Request and response shapes were taken from a public cloud tenant (release 2608).
 */

import { describe, it, expect } from 'bun:test';
import { parseIamApp, appendServices, addIamAppServices, publishIamApp } from '../../../../core/adt/iam/app';
import { nextAssignmentName, readBusinessCatalog, publishBusinessCatalog } from '../../../../core/adt/iam/catalog';
import { createIamApp } from '../../../../client/methods/iam/createIamApp';
import { createBusinessCatalog } from '../../../../client/methods/iam/createBusinessCatalog';
import type { AdtRequestor } from '../../../../core/adt';
import type { ClientState } from '../../../../client/types';

interface RecordedRequest {
    method: string;
    path: string;
    params?: Record<string, string | number>;
    headers?: Record<string, string>;
    body?: string;
}

type Responder = (req: RecordedRequest) => Response;

function mockRequestor(responder: Responder): { requestor: AdtRequestor; calls: RecordedRequest[] } {
    const calls: RecordedRequest[] = [];
    const requestor: AdtRequestor = {
        request: async (options) => {
            const call: RecordedRequest = { method: options.method, path: options.path };
            if (options.params) call.params = options.params as Record<string, string | number>;
            if (options.headers) call.headers = options.headers;
            if (options.body !== undefined) call.body = options.body;
            calls.push(call);
            return [responder(call), null];
        },
    };
    return { requestor, calls };
}

const STATE = { session: { username: 'EBOSCH' } } as unknown as ClientState;
const SIA6_PATH = '/sap/bc/adt/aps/cloud/iam/sia6';
const SIA1_PATH = '/sap/bc/adt/aps/cloud/iam/sia1';
const SIA7_PATH = '/sap/bc/adt/aps/cloud/iam/sia7';

const SERVICE_ROW = '<sia6:service><sia6:srvcType>HT</sia6:srvcType><sia6:srvcName>15E122B2645C406B8A1FBDA02D4534</sia6:srvcName><sia6:relServiceName>ZB_UI_V4</sia6:relServiceName><sia6:relServiceType>G4BA</sia6:relServiceType><sia6:typeText>OData V4</sia6:typeText><sia6:srvcDescription>Test V4</sia6:srvcDescription><sia6:uiadSource/><sia6:transactionCodeSource/></sia6:service>';

function appXml(services = ''): string {
    const servicesXml = services ? `<sia6:services>${services}</sia6:services>` : '<sia6:services/>';
    return `<?xml version="1.0" encoding="utf-8"?><sia6:sia6 adtcore:name="ZB_EXT" adtcore:type="SIA6" adtcore:description="Test app" adtcore:language="EN" xmlns:sia6="http://www.sap.com/iam/sia6" xmlns:adtcore="http://www.sap.com/adt/core"><atom:link href="versions" rel="http://www.sap.com/adt/relations/versions" xmlns:atom="http://www.w3.org/2005/Atom"/><adtcore:packageRef adtcore:uri="/sap/bc/adt/packages/zbeacon" adtcore:type="DEVC/K" adtcore:name="ZBEACON"/><sia6:content><sia6:appID>ZB_EXT</sia6:appID><sia6:appType>EXT</sia6:appType><sia6:ui5AppId/><sia6:transactionCode/><sia6:scopeDependent>false</sia6:scopeDependent><sia6:providerClass/><sia6:secondaryID/>${servicesXml}<commonAuthorization:auths xmlns:commonAuthorization="http://www.sap.com/aps/common/authorization"/><sia6:appconfigs/><sia6:publishStatus>p</sia6:publishStatus><sia6:migrationStatus>3</sia6:migrationStatus></sia6:content></sia6:sia6>`;
}

function catalogXml(publishStatus: string): string {
    return `<?xml version="1.0" encoding="utf-8"?><sia1:sia1 adtcore:name="ZB_CAT" adtcore:type="SIA1" adtcore:description="Test catalog" xmlns:sia1="http://www.sap.com/iam/sia1" xmlns:adtcore="http://www.sap.com/adt/core"><adtcore:packageRef adtcore:name="ZBEACON"/><sia1:content><sia1:businessCatalogID>ZB_CAT</sia1:businessCatalogID><sia1:publishStatus>${publishStatus}</sia1:publishStatus><sia1:migrationStatus>3</sia1:migrationStatus></sia1:content></sia1:sia1>`;
}

function bucappsXml(entries: Array<[string, string]>): string {
    const rows = entries.map(([assignment, app]) => `<sia1:bucapp><sia1:businessCatalogAppAssignmentID>${assignment}</sia1:businessCatalogAppAssignmentID><sia1:businessCatalogID>ZB_CAT</sia1:businessCatalogID><sia1:appID>${app}</sia1:appID></sia1:bucapp>`).join('');
    return `<?xml version="1.0" encoding="utf-8"?><sia1:bucapps xmlns:sia1="http://www.sap.com/iam/sia1">${rows}</sia1:bucapps>`;
}

function publishingXml(ns: 'sia6' | 'sia1', status: string): string {
    return `<?xml version="1.0" encoding="utf-8"?><${ns}:publishingStatus xmlns:${ns}="http://www.sap.com/iam/${ns}"><${ns}:publishingStatusText>${status}</${ns}:publishingStatusText></${ns}:publishingStatus>`;
}

const VALUES_V4 = '<?xml version="1.0" encoding="utf-8"?><nameditem:namedItemList xmlns:nameditem="http://www.sap.com/adt/nameditem"><nameditem:totalItemCount>2</nameditem:totalItemCount><nameditem:namedItem><nameditem:name>ZB_UI_V4_OTHER</nameditem:name><nameditem:data>G4BA</nameditem:data></nameditem:namedItem><nameditem:namedItem><nameditem:name>ZB_UI_V4</nameditem:name><nameditem:data>G4BA</nameditem:data></nameditem:namedItem></nameditem:namedItemList>';
const VALUES_V2 = '<?xml version="1.0" encoding="utf-8"?><nameditem:namedItemList xmlns:nameditem="http://www.sap.com/adt/nameditem"><nameditem:namedItem><nameditem:name>ZB_SRV                             0002</nameditem:name><nameditem:data>IWSV</nameditem:data></nameditem:namedItem><nameditem:namedItem><nameditem:name>ZB_SRV                             0001</nameditem:name><nameditem:data>IWSV</nameditem:data></nameditem:namedItem></nameditem:namedItemList>';
const DETAIL = '<?xml version="1.0" encoding="utf-8"?><sia6:odataServiceDetail xmlns:sia6="http://www.sap.com/iam/sia6"><sia6:srvcType>HT</sia6:srvcType><sia6:relServiceName>ZB_UI_V4</sia6:relServiceName><sia6:relServiceType>G4BA</sia6:relServiceType><sia6:typeText>OData V4</sia6:typeText><sia6:srvcName>D90B59D7D89631394CC0D0489B8468</sia6:srvcName><sia6:srvcDescription>Test V4</sia6:srvcDescription><sia6:uiadSource/><sia6:auths/></sia6:odataServiceDetail>';
const LOCK = '<?xml version="1.0" encoding="UTF-8"?><asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0"><asx:values><DATA><LOCK_HANDLE>H1</LOCK_HANDLE></DATA></asx:values></asx:abap>';

// An IAM app endpoint double: the app exists once created (or from the start), and a PUT replaces it.
function appResponder(initial: string | null): Responder {
    let document = initial;
    return (req) => {
        if (req.path.endsWith('/service/values')) return new Response(req.params?.['data'] === 'IWSV' ? VALUES_V2 : VALUES_V4, { status: 200 });
        if (req.path.endsWith('/service/detail')) return new Response(DETAIL, { status: 200 });
        if (req.path.endsWith('/sia6/publish')) return new Response(publishingXml('sia6', 'p'), { status: 200 });
        if (req.params?.['_action'] === 'LOCK') return new Response(LOCK, { status: 200 });
        if (req.params?.['_action'] === 'UNLOCK') return new Response('', { status: 200 });
        if (req.method === 'POST' && req.path === SIA6_PATH) {
            document = appXml();
            return new Response(document, { status: 201 });
        }
        if (req.method === 'PUT') {
            document = req.body ?? document;
            return new Response(document ?? '', { status: 200 });
        }
        if (req.method === 'GET') return document ? new Response(document, { status: 200 }) : new Response('', { status: 404 });
        return new Response('', { status: 200 });
    };
}

describe('parseIamApp', () => {
    it('reads type, package and the services tab', () => {
        const [app, error] = parseIamApp(appXml(SERVICE_ROW), 'ZB_EXT');

        expect(error).toBeNull();
        expect(app).toEqual({
            name: 'ZB_EXT',
            description: 'Test app',
            packageName: 'ZBEACON',
            appType: 'EXT',
            services: [{ name: 'ZB_UI_V4', type: 'G4BA', typeText: 'OData V4', description: 'Test V4', runtimeType: 'HT', runtimeName: '15E122B2645C406B8A1FBDA02D4534' }],
            publishStatus: 'p',
        });
    });
});

describe('appendServices', () => {
    it('adds service rows in document order and drops atom links', () => {
        const [xml, error] = appendServices(appXml(), [{ srvcType: 'HT', srvcName: 'ABC', relServiceName: 'ZB_UI_V4', relServiceType: 'G4BA', typeText: 'OData V4', srvcDescription: 'd', uiadSource: '', transactionCodeSource: '' }]);

        expect(error).toBeNull();
        expect(xml).not.toContain('atom:link');
        expect(xml).toContain('<sia6:service><sia6:srvcType>HT</sia6:srvcType><sia6:srvcName>ABC</sia6:srvcName><sia6:relServiceName>ZB_UI_V4</sia6:relServiceName><sia6:relServiceType>G4BA</sia6:relServiceType><sia6:typeText>OData V4</sia6:typeText><sia6:srvcDescription>d</sia6:srvcDescription><sia6:uiadSource/><sia6:transactionCodeSource/></sia6:service>');
    });
});

describe('addIamAppServices', () => {
    it('resolves the V4 service by exact name, then saves it under a lock', async () => {
        const { requestor, calls } = mockRequestor(appResponder(appXml()));

        const [, error] = await addIamAppServices(requestor, 'zb_ext', [{ name: 'zb_ui_v4', type: 'G4BA' }], 'TR1');

        expect(error).toBeNull();
        const detail = calls.find(c => c.path.endsWith('/service/detail'))!;
        expect(detail.params).toEqual({ serviceName: 'ZB_UI_V4', serviceType: 'G4BA', appName: 'ZB_EXT' });
        const put = calls.find(c => c.method === 'PUT')!;
        expect(put.path).toBe(`${SIA6_PATH}/zb_ext`);
        expect(put.params).toEqual({ lockHandle: 'H1', corrNr: 'TR1' });
        expect(put.body).toContain('<sia6:srvcName>D90B59D7D89631394CC0D0489B8468</sia6:srvcName>');
        expect(calls.at(-1)!.params).toMatchObject({ _action: 'UNLOCK', lockHandle: 'H1' });
    });

    it('picks the requested V2 service version from the value help', async () => {
        const { requestor, calls } = mockRequestor(appResponder(appXml()));

        const [, error] = await addIamAppServices(requestor, 'ZB_EXT', [{ name: 'ZB_SRV', type: 'IWSV', version: '0001' }]);

        expect(error).toBeNull();
        const detail = calls.find(c => c.path.endsWith('/service/detail'))!;
        expect(detail.params?.['serviceName']).toBe('ZB_SRV                             0001');
    });

    it('fails without locking when the service is unknown', async () => {
        const { requestor, calls } = mockRequestor(appResponder(appXml()));

        const [, error] = await addIamAppServices(requestor, 'ZB_EXT', [{ name: 'ZB_MISSING', type: 'G4BA' }]);

        expect(error?.message).toContain('OData V4 service binding ZB_MISSING is not offered');
        expect(calls.some(c => c.params?.['_action'] === 'LOCK')).toBe(false);
    });
});

describe('publish requests', () => {
    it('publishes an IAM app by its application parameter', async () => {
        const { requestor, calls } = mockRequestor(() => new Response(publishingXml('sia6', 'p'), { status: 200 }));

        const [status, error] = await publishIamApp(requestor, 'zb_ext');

        expect(error).toBeNull();
        expect(status).toBe('p');
        expect(calls[0]!.path).toBe(`${SIA6_PATH}/publish`);
        expect(calls[0]!.params).toEqual({ application: 'ZB_EXT' });
    });

    it('publishes a business catalog by its businessCatalogID parameter', async () => {
        const { requestor, calls } = mockRequestor(() => new Response(publishingXml('sia1', 'p'), { status: 200 }));

        const [status, error] = await publishBusinessCatalog(requestor, 'zb_cat');

        expect(error).toBeNull();
        expect(status).toBe('p');
        expect(calls[0]!.path).toBe(`${SIA1_PATH}/$publish`);
        expect(calls[0]!.params).toEqual({ businessCatalogID: 'ZB_CAT' });
    });
});

describe('createIamApp (orchestration)', () => {
    it('creates an EXT app, adds the service and publishes', async () => {
        const { requestor, calls } = mockRequestor(appResponder(null));

        const [result, error] = await createIamApp(STATE, requestor, { appName: 'zb_ext', packageName: 'zbeacon', description: 'Test app', transport: 'TR1', services: [{ name: 'ZB_UI_V4', type: 'G4BA' }] });

        expect(error).toBeNull();
        expect(result).toEqual({ name: 'ZB_EXT', created: true, servicesAdded: ['ZB_UI_V4'], published: true, publishStatus: 'p', steps: { create: 'DONE', services: 'DONE', publish: 'DONE' } });
        const create = calls.find(c => c.method === 'POST' && c.path === SIA6_PATH)!;
        expect(create.params).toEqual({ corrNr: 'TR1' });
        expect(create.body).toContain('<sia6:appType>EXT</sia6:appType>');
        expect(create.body).toContain('<adtcore:packageRef adtcore:name="ZBEACON"/>');
    });

    it('skips create and an already-listed service on a re-run, but still publishes', async () => {
        const { requestor, calls } = mockRequestor(appResponder(appXml(SERVICE_ROW)));

        const [result, error] = await createIamApp(STATE, requestor, { appName: 'ZB_EXT', packageName: 'ZBEACON', description: 'x', services: [{ name: 'zb_ui_v4', type: 'G4BA' }] });

        expect(error).toBeNull();
        expect(result?.steps).toEqual({ create: 'SKIPPED', services: 'SKIPPED', publish: 'DONE' });
        expect(calls.some(c => c.method === 'PUT')).toBe(false);
    });

    it('refuses an existing app of another type', async () => {
        const { requestor } = mockRequestor(appResponder(appXml()));

        const [, error] = await createIamApp(STATE, requestor, { appName: 'ZB_EXT', packageName: 'ZBEACON', description: 'x', appType: 'IBS', services: [] });

        expect(error?.message).toContain('already exists with application type EXT');
    });
});

describe('business catalogs', () => {
    it('numbers the next assignment after the highest existing one', () => {
        expect(nextAssignmentName('zb_cat', [])).toBe('ZB_CAT_0001');
        expect(nextAssignmentName('ZB_CAT', [{ assignment: 'ZB_CAT_0001', app: 'A' }, { assignment: 'ZB_CAT_0007', app: 'B' }])).toBe('ZB_CAT_0008');
    });

    it('reads a catalog with its assigned apps', async () => {
        const { requestor } = mockRequestor((req) => {
            if (req.path.endsWith('/$bucapps')) return new Response(bucappsXml([['ZB_CAT_0001', 'ZB_EXT']]), { status: 200 });
            return new Response(catalogXml('u'), { status: 200 });
        });

        const [catalog, error] = await readBusinessCatalog(requestor, 'ZB_CAT');

        expect(error).toBeNull();
        expect(catalog).toEqual({ name: 'ZB_CAT', description: 'Test catalog', packageName: 'ZBEACON', apps: [{ assignment: 'ZB_CAT_0001', app: 'ZB_EXT' }], publishStatus: 'u', published: false });
    });

    // Catalog double: absent until created; assignments accumulate.
    function catalogResponder(initial: { status: string; apps: Array<[string, string]> } | null): Responder {
        let catalog = initial;
        return (req) => {
            if (req.path.endsWith('/$bucapps')) return new Response(bucappsXml(catalog?.apps ?? []), { status: 200 });
            if (req.path.endsWith('/$publish')) return new Response(publishingXml('sia1', 'p'), { status: 200 });
            if (req.path.startsWith(`${SIA6_PATH}/`)) return new Response(appXml(), { status: 200 });
            if (req.method === 'POST' && req.path === SIA1_PATH) {
                catalog = { status: 'u', apps: [] };
                return new Response(catalogXml('u'), { status: 201 });
            }
            if (req.method === 'POST' && req.path === SIA7_PATH) return new Response('', { status: 201 });
            if (req.method === 'GET') return catalog ? new Response(catalogXml(catalog.status), { status: 200 }) : new Response('', { status: 404 });
            return new Response('', { status: 200 });
        };
    }

    it('creates the catalog, assigns the app with a description and publishes', async () => {
        const { requestor, calls } = mockRequestor(catalogResponder(null));

        const [result, error] = await createBusinessCatalog(STATE, requestor, { catalogName: 'zb_cat', packageName: 'ZBEACON', description: 'Test catalog', transport: 'TR1', apps: ['zb_ext'] });

        expect(error).toBeNull();
        expect(result).toEqual({ name: 'ZB_CAT', created: true, assignmentsAdded: [{ assignment: 'ZB_CAT_0001', app: 'ZB_EXT' }], published: true, publishStatus: 'p', steps: { create: 'DONE', assign: 'DONE', publish: 'DONE' } });
        const assign = calls.find(c => c.method === 'POST' && c.path === SIA7_PATH)!;
        expect(assign.params).toEqual({ corrNr: 'TR1' });
        expect(assign.body).toContain('adtcore:name="ZB_CAT_0001"');
        expect(assign.body).toContain('adtcore:description="ZB_EXT in ZB_CAT"');
        expect(assign.body).toContain('<sia7:appID>ZB_EXT</sia7:appID>');
    });

    it('skips everything when the catalog is published and already holds the app', async () => {
        const { requestor, calls } = mockRequestor(catalogResponder({ status: 'p', apps: [['ZB_CAT_0001', 'ZB_EXT']] }));

        const [result, error] = await createBusinessCatalog(STATE, requestor, { catalogName: 'ZB_CAT', packageName: 'ZBEACON', description: 'x', apps: ['ZB_EXT'] });

        expect(error).toBeNull();
        expect(result?.steps).toEqual({ create: 'SKIPPED', assign: 'SKIPPED', publish: 'SKIPPED' });
        expect(result?.published).toBe(true);
        expect(calls.some(c => c.method === 'POST')).toBe(false);
    });

    it('fails before assigning an IAM app that does not exist', async () => {
        const { requestor, calls } = mockRequestor((req) => {
            if (req.path.startsWith(`${SIA6_PATH}/`)) return new Response('', { status: 404 });
            return catalogResponder({ status: 'u', apps: [] })(req);
        });

        const [, error] = await createBusinessCatalog(STATE, requestor, { catalogName: 'ZB_CAT', packageName: 'ZBEACON', description: 'x', apps: ['ZB_TYPO'] });

        expect(error?.message).toBe('IAM app ZB_TYPO does not exist');
        expect(calls.some(c => c.path === SIA7_PATH)).toBe(false);
    });
});
