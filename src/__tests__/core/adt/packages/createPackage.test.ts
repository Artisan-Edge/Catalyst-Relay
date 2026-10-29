/**
 * Unit Tests for createPackage — sub-package creation with settings inherited from the parent
 */

import { describe, it, expect } from 'bun:test';
import { createPackage, parsePackageSettings } from '../../../../core/adt/packages/createPackage';
import type { AdtRequestor } from '../../../../core/adt';

interface RecordedRequest {
    method: string;
    path: string;
    params?: Record<string, string | number>;
    body?: string;
}

function mockRequestor(responder: (req: RecordedRequest) => Response): { requestor: AdtRequestor; calls: RecordedRequest[] } {
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

// A packages.v2 document as a public cloud tenant returns it.
function packageXml(name: string, parent: string, softwareComponent = 'ZLOCAL', transportLayer = ''): string {
    return `<?xml version="1.0" encoding="utf-8"?><pak:package adtcore:name="${name}" adtcore:type="DEVC/K" adtcore:version="active" adtcore:description="${name} package" xmlns:pak="http://www.sap.com/adt/packages" xmlns:adtcore="http://www.sap.com/adt/core"><atom:link href="versions" xmlns:atom="http://www.w3.org/2005/Atom"/><adtcore:packageRef adtcore:name="${name}"/><pak:attributes pak:packageType="development" pak:isEncapsulated="false"/><pak:superPackage adtcore:uri="/sap/bc/adt/packages/${parent.toLowerCase()}" adtcore:type="DEVC/K" adtcore:name="${parent}"/><pak:applicationComponent pak:name=""/><pak:transport><pak:softwareComponent pak:name="${softwareComponent}" pak:description="Local Development"/><pak:transportLayer pak:name="${transportLayer}" pak:description=""/></pak:transport><pak:useAccesses/><pak:packageInterfaces/><pak:subPackages/></pak:package>`;
}

const OPTIONS = { packageName: 'zbeacon_write', parentPackage: 'zbeacon', description: 'Beacon Write', transport: 'ZAOK900285' };

describe('parsePackageSettings', () => {
    it('reads the parent, software component and transport layer', () => {
        const [settings, error] = parsePackageSettings(packageXml('ZBEACON', 'ZSNAP', 'HOME', 'ZDEV'), 'ZBEACON');

        expect(error).toBeNull();
        expect(settings).toEqual({ name: 'ZBEACON', description: 'ZBEACON package', parentPackage: 'ZSNAP', softwareComponent: 'HOME', transportLayer: 'ZDEV', packageType: 'development' });
    });
});

describe('createPackage', () => {
    it('creates the sub-package with the parent software component and transport layer', async () => {
        const { requestor, calls } = mockRequestor((req) => {
            if (req.method === 'GET' && req.path.endsWith('/zbeacon_write')) return new Response('', { status: 404 });
            if (req.method === 'GET') return new Response(packageXml('ZBEACON', 'ZSNAP', 'HOME', 'ZDEV'), { status: 200 });
            return new Response('', { status: 201 });
        });

        const [result, error] = await createPackage(requestor, OPTIONS, 'ebosch');

        expect(error).toBeNull();
        expect(result).toEqual({ name: 'ZBEACON_WRITE', parentPackage: 'ZBEACON', softwareComponent: 'HOME', transportLayer: 'ZDEV', created: true });
        const post = calls.find(c => c.method === 'POST')!;
        expect(post.path).toBe('/sap/bc/adt/packages');
        expect(post.params).toEqual({ corrNr: 'ZAOK900285' });
        expect(post.body).toContain('adtcore:name="ZBEACON_WRITE"');
        expect(post.body).toContain('adtcore:responsible="EBOSCH"');
        expect(post.body).toContain('<pak:superPackage adtcore:name="ZBEACON"/>');
        expect(post.body).toContain('<pak:softwareComponent pak:name="HOME"/>');
        expect(post.body).toContain('<pak:transportLayer pak:name="ZDEV"/>');
    });

    it('uses explicit software component and transport layer over the parent', async () => {
        const { requestor, calls } = mockRequestor((req) => {
            if (req.method === 'GET' && req.path.endsWith('/zbeacon_write')) return new Response('', { status: 404 });
            if (req.method === 'GET') return new Response(packageXml('ZBEACON', 'ZSNAP'), { status: 200 });
            return new Response('', { status: 201 });
        });

        const [result] = await createPackage(requestor, { ...OPTIONS, softwareComponent: 'zcustom', transportLayer: 'zlay' }, 'ebosch');

        expect(result?.softwareComponent).toBe('ZCUSTOM');
        expect(calls.find(c => c.method === 'POST')!.body).toContain('<pak:transportLayer pak:name="ZLAY"/>');
    });

    it('reports an existing package under the same parent without creating it', async () => {
        const { requestor, calls } = mockRequestor(() => new Response(packageXml('ZBEACON_WRITE', 'ZBEACON'), { status: 200 }));

        const [result, error] = await createPackage(requestor, OPTIONS, 'ebosch');

        expect(error).toBeNull();
        expect(result?.created).toBe(false);
        expect(calls.some(c => c.method === 'POST')).toBe(false);
    });

    it('refuses an existing package under another parent', async () => {
        const { requestor } = mockRequestor(() => new Response(packageXml('ZBEACON_WRITE', 'ZOTHER'), { status: 200 }));

        const [, error] = await createPackage(requestor, OPTIONS, 'ebosch');

        expect(error?.message).toContain('already exists under ZOTHER');
    });

    it('fails when the parent does not exist', async () => {
        const { requestor } = mockRequestor(() => new Response('', { status: 404 }));

        const [, error] = await createPackage(requestor, OPTIONS, 'ebosch');

        expect(error?.message).toBe('Super-package ZBEACON does not exist');
    });
});
