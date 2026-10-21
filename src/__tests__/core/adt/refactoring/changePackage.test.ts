/**
 * Unit Tests for changePackage
 *
 * Verifies the change-package refactoring flow:
 * - Current package lookup → preview → execute → verify
 * - Preview mode stops after the preview step
 * - Execute sends back the server's generic refactoring with the transport set
 * - SAP errors and unverified changes are reported per object
 * - Rejected transportable-to-local moves carry a hint
 */

import { describe, it, expect } from 'bun:test';
import { changePackage } from '../../../../core/adt/refactoring/changePackage';
import { buildExecuteBody } from '../../../../core/adt/refactoring/helpers';
import type { AdtRequestor } from '../../../../core/adt';

interface RecordedRequest {
    method: string;
    path: string;
    params?: Record<string, string | number>;
    body?: string;
}

type Responder = (req: RecordedRequest) => Response;

// Preview response as returned by an S/4HANA Cloud system.
const PREVIEW_XML = '<?xml version="1.0" encoding="utf-8"?><generic:genericRefactoring xmlns:generic="http://www.sap.com/adt/refactoring/genericrefactoring"><generic:title>Change Package</generic:title><generic:adtObjectUri>/sap/bc/adt/ddic/ddl/sources/ztt_test</generic:adtObjectUri><generic:affectedObjects><generic:affectedObject adtcore:uri="/sap/bc/adt/ddic/ddl/sources/ztt_test" adtcore:type="DDLS/DF" adtcore:name="ZTT_TEST" adtcore:packageName="ZSNAP_TEMP" adtcore:description="View" xmlns:adtcore="http://www.sap.com/adt/core"><generic:userContent/><generic:changePackageDelta><generic:newPackage>ZSNAP</generic:newPackage></generic:changePackageDelta></generic:affectedObject></generic:affectedObjects><generic:transport/><generic:ignoreSyntaxErrorsAllowed>false</generic:ignoreSyntaxErrorsAllowed><generic:ignoreSyntaxErrors>false</generic:ignoreSyntaxErrors><generic:userContent/></generic:genericRefactoring>';

const ERROR_XML = '<?xml version="1.0" encoding="utf-8"?><exc:exception xmlns:exc="http://www.sap.com/abapxml/types/communicationframework"><message lang="EN">No authorization for changing the package</message></exc:exception>';

function packageXml(pkg: string): string {
    return `<?xml version="1.0" encoding="utf-8"?><opr:objectProperties xmlns:opr="http://www.sap.com/adt/ris/objectProperties"><opr:object package="${pkg}"/></opr:objectProperties>`;
}

interface PackageInfo {
    component: string;
    recordChanges: boolean;
}

function packageInfoXml(info: PackageInfo): string {
    return `<?xml version="1.0" encoding="utf-8"?><pak:package xmlns:pak="http://www.sap.com/adt/packages"><pak:attributes pak:packageType="development" pak:recordChanges="${info.recordChanges}"/><pak:transport><pak:softwareComponent pak:name="${info.component}"/></pak:transport></pak:package>`;
}

const TRANSPORTABLE: PackageInfo = { component: 'ZCUSTOM_DEVELOPMENT', recordChanges: true };
const LOCAL: PackageInfo = { component: 'ZLOCAL', recordChanges: false };

function mockRequestor(responder: Responder): { requestor: AdtRequestor; calls: RecordedRequest[] } {
    const calls: RecordedRequest[] = [];
    const requestor: AdtRequestor = {
        request: async (options) => {
            const call: RecordedRequest = { method: options.method, path: options.path };
            if (options.params) call.params = options.params as Record<string, string | number>;
            if (options.body !== undefined) call.body = options.body;
            calls.push(call);
            return [responder(call), null];
        },
    };
    return { requestor, calls };
}

// Package lookups answer with packages[] in order (last one repeats); refactoring steps succeed.
function responder(packages: string[], overrides: { execute?: Response; packages?: Record<string, PackageInfo> } = {}): Responder {
    let lookups = 0;
    return (req) => {
        if (req.path.includes('objectproperties')) {
            const pkg = packages[Math.min(lookups++, packages.length - 1)]!;
            return new Response(packageXml(pkg), { status: 200 });
        }
        const info = overrides.packages?.[req.path.split('/').pop()!];
        if (req.path.startsWith('/sap/bc/adt/packages/') && info) {
            return new Response(packageInfoXml(info), { status: 200 });
        }
        if (req.params?.['step'] === 'preview') return new Response(PREVIEW_XML, { status: 200 });
        if (req.params?.['step'] === 'execute') return overrides.execute ?? new Response('', { status: 200 });
        return new Response('', { status: 404 });
    };
}

const VIEW = { name: 'ztt_test', extension: 'asddls' };

describe('changePackage', () => {
    it('stops after the preview step in preview mode', async () => {
        const { requestor, calls } = mockRequestor(responder(['ZSNAP_TEMP']));

        const [results, error] = await changePackage(requestor, [VIEW], 'zsnap', { preview: true });

        expect(error).toBeNull();
        expect(results).toEqual([
            { name: 'ZTT_TEST', extension: 'asddls', oldPackage: 'ZSNAP_TEMP', newPackage: 'ZSNAP', status: 'preview' },
        ]);
        expect(calls).toHaveLength(2);

        const preview = calls[1]!;
        expect(preview.method).toBe('POST');
        expect(preview.path).toBe('/sap/bc/adt/refactorings');
        expect(preview.params).toEqual({ step: 'preview', rel: 'http://www.sap.com/adt/relations/refactoring/changepackage' });
        expect(preview.body).toContain('<changepackage:oldPackage>ZSNAP_TEMP</changepackage:oldPackage>');
        expect(preview.body).toContain('<changepackage:newPackage>ZSNAP</changepackage:newPackage>');
        expect(preview.body).toContain('<generic:adtObjectUri>/sap/bc/adt/ddic/ddl/sources/ztt_test</generic:adtObjectUri>');
        expect(preview.body).toContain('adtcore:type="DDLS/DF"');
    });

    it('looks up the current package by object URI', async () => {
        const { requestor, calls } = mockRequestor(responder(['ZSNAP_TEMP']));

        await changePackage(requestor, [VIEW], 'ZSNAP', { preview: true });

        expect(calls[0]!.method).toBe('GET');
        expect(calls[0]!.path).toContain(`uri=${encodeURIComponent('/sap/bc/adt/ddic/ddl/sources/ztt_test')}`);
        expect(calls[0]!.path).toContain('facet=package');
    });

    it('executes with the server refactoring and verifies the new package', async () => {
        const { requestor, calls } = mockRequestor(responder(['ZSNAP_TEMP', 'ZSNAP']));

        const [results, error] = await changePackage(requestor, [VIEW], 'ZSNAP', { transport: 'FVMK900502' });

        expect(error).toBeNull();
        expect(results![0]!.status).toBe('moved');
        expect(calls).toHaveLength(4);

        const execute = calls[2]!;
        expect(execute.params).toEqual({ step: 'execute' });
        expect(execute.body).toContain('<generic:transport>FVMK900502</generic:transport>');
        expect(execute.body).toContain('<generic:newPackage>ZSNAP</generic:newPackage>');
        expect(execute.body).not.toContain('changepackage:');
        expect(calls[3]!.path).toContain('objectproperties');
    });

    it('reports unchanged without calling the refactoring endpoint', async () => {
        const { requestor, calls } = mockRequestor(responder(['ZSNAP']));

        const [results] = await changePackage(requestor, [VIEW], 'ZSNAP');

        expect(results![0]!.status).toBe('unchanged');
        expect(calls).toHaveLength(1);
    });

    it('reports the SAP message when execute fails', async () => {
        const execute = new Response(ERROR_XML, { status: 500 });
        const { requestor } = mockRequestor(responder(['ZSNAP_TEMP'], { execute }));

        const [results, error] = await changePackage(requestor, [VIEW], 'ZSNAP');

        expect(error).toBeNull();
        expect(results![0]!.status).toBe('error');
        expect(results![0]!.message).toContain('No authorization for changing the package');
        expect(results![0]!.oldPackage).toBe('ZSNAP_TEMP');
    });

    it('adds a hint when a transportable-to-local move is rejected', async () => {
        const execute = new Response(ERROR_XML, { status: 500 });
        const packages = { zsnap_temp: TRANSPORTABLE, zsnap: LOCAL };
        const { requestor } = mockRequestor(responder(['ZSNAP_TEMP'], { execute, packages }));

        const [results] = await changePackage(requestor, [VIEW], 'ZSNAP');

        expect(results![0]!.message).toContain('No authorization for changing the package');
        expect(results![0]!.message).toContain('ZSNAP_TEMP is transportable (ZCUSTOM_DEVELOPMENT) and ZSNAP is local (ZLOCAL)');
    });

    it('adds no hint for a rejected local-to-transportable move', async () => {
        // SAP allows this direction, so a rejection has another cause.
        const execute = new Response(ERROR_XML, { status: 500 });
        const packages = { zsnap_temp: LOCAL, zsnap: TRANSPORTABLE };
        const { requestor } = mockRequestor(responder(['ZSNAP_TEMP'], { execute, packages }));

        const [results] = await changePackage(requestor, [VIEW], 'ZSNAP');

        expect(results![0]!.message).not.toContain('local');
    });

    it('does not look up software components when the move succeeds', async () => {
        const { requestor, calls } = mockRequestor(responder(['ZSNAP_TEMP', 'ZSNAP']));

        await changePackage(requestor, [VIEW], 'ZSNAP');

        expect(calls.some(c => c.path.startsWith('/sap/bc/adt/packages/'))).toBe(false);
    });

    it('reports an error when the package did not change', async () => {
        const { requestor } = mockRequestor(responder(['ZSNAP_TEMP']));

        const [results] = await changePackage(requestor, [VIEW], 'ZSNAP');

        expect(results![0]!.status).toBe('error');
        expect(results![0]!.message).toContain('still in ZSNAP_TEMP');
    });

    it('continues with remaining objects after a failure', async () => {
        const { requestor } = mockRequestor((req) => {
            if (req.path.includes('ztt_missing')) return new Response(ERROR_XML, { status: 404 });
            return responder(['ZSNAP_TEMP'])(req);
        });

        const [results] = await changePackage(requestor, [{ name: 'ZTT_MISSING', extension: 'asddls' }, VIEW], 'ZSNAP', { preview: true });

        expect(results!.map(r => r.status)).toEqual(['error', 'preview']);
    });

    it.each([
        ['dtel', '/sap/bc/adt/ddic/dataelements/zsnap_signage', 'DTEL/DE'],
        ['doma', '/sap/bc/adt/ddic/domains/zsnap_signage', 'DOMA/DD'],
        ['fugr', '/sap/bc/adt/functions/groups/zsnap_signage', 'FUGR/F'],
        ['srvb', '/sap/bc/adt/businessservices/bindings/zsnap_signage', 'SRVB/SVB'],
    ])('addresses move-only type %s by its own endpoint', async (extension, uri, type) => {
        const { requestor, calls } = mockRequestor(responder(['ZSNAP_TEMP']));

        const [results, error] = await changePackage(requestor, [{ name: 'ZSNAP_SIGNAGE', extension }], 'ZSNAP', { preview: true });

        expect(error).toBeNull();
        expect(results![0]!.status).toBe('preview');
        expect(calls[0]!.path).toContain(`uri=${encodeURIComponent(uri)}`);
        expect(calls[1]!.body).toContain(`<generic:adtObjectUri>${uri}</generic:adtObjectUri>`);
        expect(calls[1]!.body).toContain(`adtcore:type="${type}"`);
    });

    it('rejects unsupported extensions before any request', async () => {
        const { requestor, calls } = mockRequestor(responder(['ZSNAP_TEMP']));

        const [results, error] = await changePackage(requestor, [{ name: 'X', extension: 'nope' }], 'ZSNAP');

        expect(results).toBeNull();
        expect(error!.message).toContain('Unsupported extension');
        expect(calls).toHaveLength(0);
    });

    it('rejects an empty target package', async () => {
        const { requestor } = mockRequestor(responder(['ZSNAP_TEMP']));

        const [, error] = await changePackage(requestor, [VIEW], '  ');

        expect(error!.message).toContain('Target package is required');
    });
});

describe('buildExecuteBody', () => {
    it('adds the transport element when the preview omits it', () => {
        const preview = PREVIEW_XML.replace('<generic:transport/>', '');

        const [body, error] = buildExecuteBody(preview, 'FVMK900502');

        expect(error).toBeNull();
        expect(body).toContain('>FVMK900502</generic:transport>');
    });

    it('rejects a response without a generic refactoring', () => {
        const [, error] = buildExecuteBody('<?xml version="1.0"?><other/>', '');

        expect(error!.message).toContain('genericRefactoring');
    });
});
