/**
 * Unit Tests for the MDA app generator client (validate, preview, generate)
 *
 * Fixtures: generator calls captured on Madiba-Cloud-Dev (2026-11-05).
 */

import { describe, it, expect } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { generateMdaApp, parseGeneratedObjects } from '../../../../core/adt/generators/generateMdaApp';
import { previewMdaApp, parseMdaPreview } from '../../../../core/adt/generators/previewMdaApp';
import { validateMdaApp, parseValidationMessages, classifyMdaValidation } from '../../../../core/adt/generators/validateMdaApp';
import { buildMdaContent } from '../../../../core/adt/generators/helpers';
import { generateMdaApp as clientGenerate } from '../../../../client/methods/generators/mdaApp';
import type { MdaAppOptions } from '../../../../core/adt';
import type { ClientState } from '../../../../client/types';
import { recorder, xml } from '../iam/iamTestKit';
import type { Call, Reply } from '../iam/iamTestKit';

const FIXTURES = path.join(import.meta.dir, '../../../fixtures/generators');
const fixture = (name: string): string => fs.readFileSync(path.join(FIXTURES, name), 'utf8');
const MDA = '/sap/bc/adt/analytics/generators/ui/mda-app';
const CONTENT_TYPE = 'application/vnd.sap.adt.serverdriven.content.v1+json; framework=generators.v1';

// The names of the captured "existing" set
const OPTIONS: MdaAppOptions = {
    queryName: 'ZSNAP_F70S_Q01',
    packageName: 'ZSNAP_BC',
    appDescriptor: 'ZSNAP_BC_UIAD_MDA',
    appVariantId: 'customer.ZSNAP_BC_MDA_AV',
    title: 'SNAP BC Test',
    subTitle: 'MDA generator probe',
    semanticObject: 'ZSNAPBC',
    semanticAction: 'display',
    icon: 'sap-icon://line-charts',
    serviceDefinition: 'ZSNAP_BC_MDA_SD',
    serviceBinding: 'ZSNAP_BC_MDA_SB',
    iamApp: 'ZSNAP_BC_MDA_EXT',
};

// The names of the captured generate (delete-order probe)
const DEL_OPTIONS: MdaAppOptions = {
    ...OPTIONS,
    appDescriptor: 'ZSNAP_BC_DEL_AD',
    appVariantId: 'customer.ZSNAP_BC_DEL_AV',
    serviceDefinition: 'ZSNAP_BC_DEL_SD',
    serviceBinding: 'ZSNAP_BC_DEL_SB',
    iamApp: 'ZSNAP_BC_DEL_EXT',
};

// Package ZSNAP_BC as captured on Madiba-Cloud-Dev (ZLOCAL, recordChanges false), or a recording variant
const PACKAGE = (records: boolean): string => fixture('package-zsnap_bc.xml').replace('pak:recordChanges="false"', `pak:recordChanges="${records}"`);

// Generator endpoint double: validation, preview, generate and the package read answered per path
function generator(validation: string, generate: () => Reply = () => xml(fixture('mda-generate.xml')), records = true): (call: Call) => Reply {
    return (call) => {
        if (call.path === '/sap/bc/adt/packages/zsnap_bc') return xml(PACKAGE(records));
        if (call.path === `${MDA}/validation`) return xml(validation);
        if (call.path === `${MDA}/preview`) return xml(fixture('mda-preview.xml'));
        if (call.path === MDA) return generate();
        return xml('', 404);
    };
}

describe('MDA generator request body', () => {
    it('builds the captured content JSON', () => {
        const captured = {
            metadata: { package: 'ZSNAP_BC', masterLanguage: 'EN' },
            control: { referenceObjectType: 'QUERY', abapLanguageVersion: '5' },
            queryName: 'ZSNAP_F70S_Q01',
            fioriApp: {
                appDescriptorId: 'ZSNAP_BC_UIAD_MDA',
                appVariantId: 'customer.ZSNAP_BC_MDA_AV',
                title: 'SNAP BC Test',
                subTitle: 'MDA generator probe',
                semanticObject: 'ZSNAPBC',
                semanticAction: 'display',
                icon: 'sap-icon://line-charts',
            },
            businessService: { serviceDefinition: 'ZSNAP_BC_MDA_SD', serviceBinding: 'ZSNAP_BC_MDA_SB' },
            cloudIam: { iamApp: 'ZSNAP_BC_MDA_EXT' },
        };

        expect(JSON.parse(buildMdaContent(OPTIONS))).toEqual(captured);
    });

    it('upper-cases DDIC names, keeps the app variant ID, and leaves out empty optional parts', () => {
        const bare: MdaAppOptions = { ...OPTIONS, serviceBinding: 'zsnap_bc_mda_sb', packageName: 'zsnap_bc' };
        delete bare.subTitle;
        delete bare.icon;
        delete bare.iamApp;
        const content = JSON.parse(buildMdaContent(bare));

        expect(content.businessService.serviceBinding).toBe('ZSNAP_BC_MDA_SB');
        expect(content.metadata.package).toBe('ZSNAP_BC');
        expect(content.fioriApp.appVariantId).toBe('customer.ZSNAP_BC_MDA_AV');
        expect(content.fioriApp).not.toHaveProperty('subTitle');
        expect(content.fioriApp).not.toHaveProperty('icon');
        expect(content).not.toHaveProperty('cloudIam');
    });
});

describe('MDA validation', () => {
    it('parses an OK validation as an absent set', () => {
        const [messages] = parseValidationMessages(fixture('mda-validation-ok.xml'));

        expect(messages).toEqual([{ severity: 'OK', text: '' }]);
        expect(classifyMdaValidation(messages!, OPTIONS)).toEqual({ messages: [], existing: [], expected: ['appDescriptor', 'appVariant', 'serviceDefinition', 'serviceBinding', 'iamApp'], errors: [], set: 'absent' });
    });

    it('recognises every "already exists" text (SAP typo, double space) as a present set', () => {
        const [messages] = parseValidationMessages(fixture('mda-validation-existing.xml'));
        const validation = classifyMdaValidation(messages!, OPTIONS);

        expect(messages).toHaveLength(5);
        expect(validation.existing.sort()).toEqual(['appDescriptor', 'appVariant', 'iamApp', 'serviceBinding', 'serviceDefinition']);
        expect(validation.errors).toEqual([]);
        expect(validation.set).toBe('present');
    });

    it('reports a partial set when only some objects exist', () => {
        const [messages] = parseValidationMessages(fixture('mda-validation-existing.xml'));
        const someExist = messages!.filter(message => !/IAM App|SAPUI5/.test(message.text));
        const validation = classifyMdaValidation(someExist, OPTIONS);

        expect(validation.existing.sort()).toEqual(['appDescriptor', 'serviceBinding', 'serviceDefinition']);
        expect(validation.set).toBe('partial');
    });

    it('treats an "already exists" for another name, or any other ERROR, as an error', () => {
        const [messages] = parseValidationMessages(fixture('mda-validation-existing.xml'));
        const validation = classifyMdaValidation(messages!, { ...OPTIONS, iamApp: 'ZSNAP_BC_OTHER_EXT' });
        const other = classifyMdaValidation([{ severity: 'ERROR', text: 'Package ZSNAP_BC does not exist' }], OPTIONS);

        expect(validation.errors).toEqual(['IAM App ZSNAP_BC_MDA_EXT already exists']);
        expect(other.errors).toEqual(['Package ZSNAP_BC does not exist']);
        expect(other.set).toBe('absent');
    });

    it('expects no IAM app when none is named', () => {
        const [messages] = parseValidationMessages(fixture('mda-validation-existing.xml'));
        const withoutIam: MdaAppOptions = { ...OPTIONS };
        delete withoutIam.iamApp;
        const validation = classifyMdaValidation(messages!.filter(message => !/IAM App/.test(message.text)), withoutIam);

        expect(validation.expected).not.toContain('iamApp');
        expect(validation.set).toBe('present');
    });

    it('posts the content stateless with checks, package and the validation media type', async () => {
        const { requestor, calls } = recorder(() => xml(fixture('mda-validation-ok.xml')));

        const [validation, error] = await validateMdaApp(requestor, OPTIONS);

        expect(error).toBeNull();
        expect(validation?.set).toBe('absent');
        expect(calls[0]).toMatchObject({
            method: 'POST',
            path: `${MDA}/validation`,
            params: { referencedObject: '/sap/bc/adt/ddic/ddl/sources/zsnap_f70s_q01', package: 'ZSNAP_BC', checks: 'package,referencedobject,authorization' },
            headers: { 'Content-Type': CONTENT_TYPE, 'Accept': 'application/vnd.sap.adt.validationMessages.v1+xml', 'X-sap-adt-sessiontype': 'stateless' },
        });
        expect(JSON.parse(calls[0]!.body!)).toEqual(JSON.parse(buildMdaContent(OPTIONS)));
    });

    it('counts any severity but OK/INFO/WARNING as an error (FATAL, E)', () => {
        const validation = classifyMdaValidation([{ severity: 'FATAL', text: 'Generator broke' }, { severity: 'E', text: 'Bad package' }, { severity: 'WARNING', text: 'Just a note' }], OPTIONS);

        expect(validation.errors).toEqual(['Generator broke', 'Bad package']);
    });

    it('matches whole names only: an "already exists" for a longer name is an error', () => {
        const validation = classifyMdaValidation([{ severity: 'ERROR', text: `IAM App ${OPTIONS.iamApp}2 already exists` }], OPTIONS);

        expect(validation.existing).toEqual([]);
        expect(validation.errors).toHaveLength(1);
    });

    it('refuses a validationMessages root in another namespace', () => {
        const [, error] = parseValidationMessages('<validationMessages xmlns="http://example.com/other"/>');

        expect(error?.message).toContain('unexpected response');
    });

    it('refuses a non-validation response', () => {
        const [, error] = parseValidationMessages('<html><body>logon</body></html>');

        expect(error?.message).toContain('unexpected response');
    });
});

describe('MDA preview', () => {
    it('parses the planned objects and the app variant system name', () => {
        const [preview, error] = parseMdaPreview(fixture('mda-preview.xml'));

        expect(error).toBeNull();
        expect(preview?.appVariant).toBe('ZCGCBVVXGRUU24WMMTWYCF6CISU');
        expect(preview?.objects.map(object => `${object.operation} ${object.type} ${object.name}`)).toEqual([
            'CREATE UIAD/TYP ZSNAP_BC_UIAD_MDA',
            'CREATE ADVC/LRP ZCGCBVVXGRUU24WMMTWYCF6CISU',
            'CREATE SRVD/SRV ZSNAP_BC_MDA_SD',
            'CREATE SRVB/SVB ZSNAP_BC_MDA_SB',
            'CREATE SIA6 ZSNAP_BC_MDA_EXT',
        ]);
        expect(preview?.objects[1]?.uri).toBe('/sap/bc/adt/vit/wb/object_type/advclrp/object_name/ZCGCBVVXGRUU24WMMTWYCF6CISU');
    });

    it('returns null for the app variant when the preview does not list one', () => {
        const [preview] = parseMdaPreview(fixture('mda-preview.xml').replaceAll('ADVC/LRP', 'XXXX/X'));

        expect(preview?.appVariant).toBeNull();
    });

    it('posts to /preview stateless with the massoperation media type', async () => {
        const { requestor, calls } = recorder(() => xml(fixture('mda-preview.xml')));

        await previewMdaApp(requestor, OPTIONS);

        expect(calls[0]).toMatchObject({ path: `${MDA}/preview`, params: { package: 'ZSNAP_BC' }, headers: { 'Accept': 'application/vnd.sap.adt.repository.objects.massoperation.v1+xml', 'X-sap-adt-sessiontype': 'stateless' } });
    });
});

describe('MDA generate', () => {
    it('parses the generate response (no app variant listed)', () => {
        const [objects, error] = parseGeneratedObjects(fixture('mda-generate.xml'));

        expect(error).toBeNull();
        expect(objects?.map(object => `${object.type} ${object.name}`)).toEqual(['UIAD/TYP ZSNAP_BC_DEL_AD', 'SRVD/SRV ZSNAP_BC_DEL_SD', 'SRVB/SVB ZSNAP_BC_DEL_SB', 'SIA6 ZSNAP_BC_DEL_EXT']);
    });

    it('validates, previews, then generates an absent set', async () => {
        const { requestor, calls } = recorder(generator(fixture('mda-validation-ok.xml')));

        const [result, error] = await generateMdaApp(requestor, { ...DEL_OPTIONS, transport: 'TR1' });

        expect(error).toBeNull();
        expect(calls.map(call => call.path)).toEqual([`${MDA}/validation`, `${MDA}/preview`, '/sap/bc/adt/packages/zsnap_bc', MDA]);
        expect(calls[3]).toMatchObject({ params: { referencedObject: '/sap/bc/adt/ddic/ddl/sources/zsnap_f70s_q01', package: 'ZSNAP_BC', corrNr: 'TR1' }, timeout: 300_000, headers: { 'Content-Type': CONTENT_TYPE, 'X-sap-adt-sessiontype': 'stateless' } });
        expect(result?.transportSkipped).toBe(false);
        expect(result).toMatchObject({
            status: 'created',
            appDescriptor: 'ZSNAP_BC_DEL_AD',
            appVariantId: 'customer.ZSNAP_BC_DEL_AV',
            appVariant: 'ZCGCBVVXGRUU24WMMTWYCF6CISU',
            serviceDefinition: 'ZSNAP_BC_DEL_SD',
            serviceBinding: 'ZSNAP_BC_DEL_SB',
            iamApp: 'ZSNAP_BC_DEL_EXT',
            steps: { validate: 'DONE', preview: 'DONE', generate: 'DONE' },
        });
        expect(result?.generated).toHaveLength(4);
    });

    it('passes no transport for a package that does not record changes (SAP fails with one there)', async () => {
        const { requestor, calls } = recorder(generator(fixture('mda-validation-ok.xml'), undefined, false));

        const [result, error] = await generateMdaApp(requestor, { ...DEL_OPTIONS, transport: 'TR1' });

        expect(error).toBeNull();
        expect(calls.at(-1)!.path).toBe(MDA);
        expect(calls.at(-1)!.params).not.toHaveProperty('corrNr');
        expect(result?.transportSkipped).toBe(true);
    });

    it('reads no package without a transport, and fails when the package cannot be read', async () => {
        const plain = recorder(generator(fixture('mda-validation-ok.xml')));
        await generateMdaApp(plain.requestor, DEL_OPTIONS);
        expect(plain.calls.some(call => call.path.startsWith('/sap/bc/adt/packages/'))).toBe(false);

        const failing = recorder((call) => (call.path.startsWith('/sap/bc/adt/packages/') ? xml('', 404) : generator(fixture('mda-validation-ok.xml'))(call)));
        const [, error] = await generateMdaApp(failing.requestor, { ...DEL_OPTIONS, transport: 'TR1' });
        expect(error?.message).toContain('cannot tell whether package ZSNAP_BC records changes');
        expect(failing.calls.some(call => call.path === MDA)).toBe(false);
    });

    it('skips a present set but still returns the app variant name', async () => {
        const { requestor, calls } = recorder(generator(fixture('mda-validation-existing.xml')));

        const [result, error] = await generateMdaApp(requestor, OPTIONS);

        expect(error).toBeNull();
        expect(calls.map(call => call.path)).toEqual([`${MDA}/validation`, `${MDA}/preview`]);
        expect(result).toMatchObject({ status: 'present', appVariant: 'ZCGCBVVXGRUU24WMMTWYCF6CISU', generated: [], steps: { generate: 'SKIPPED' } });
        expect(result?.messages).toHaveLength(5);
    });

    it('refuses a partial set before generating', async () => {
        const partial = fixture('mda-validation-existing.xml').replace(/<validationMessages:validationMessage><validationMessages:severity>ERROR<\/validationMessages:severity><validationMessages:shorttext lang="EN">IAM App[\s\S]*?<\/validationMessages:validationMessage>/, '');
        const { requestor, calls } = recorder(generator(partial));

        const [result, error] = await generateMdaApp(requestor, OPTIONS);

        expect(result).toBeNull();
        expect(error?.message).toContain('partly present');
        expect(error?.message).toContain('missing: iamApp ZSNAP_BC_MDA_EXT');
        expect(calls).toHaveLength(1);
    });

    it('refuses other validation errors', async () => {
        const failing = fixture('mda-validation-ok.xml').replace('<validationMessages:severity>OK</validationMessages:severity>', '<validationMessages:severity>ERROR</validationMessages:severity><validationMessages:shorttext lang="EN">No authorization for package ZSNAP_BC</validationMessages:shorttext>');
        const { requestor, calls } = recorder(generator(failing));

        const [, error] = await generateMdaApp(requestor, OPTIONS);

        expect(error?.message).toBe('MDA app validation failed: No authorization for package ZSNAP_BC');
        expect(calls).toHaveLength(1);
    });

    it('reports a generate timeout as possibly still running', async () => {
        const { requestor } = recorder(generator(fixture('mda-validation-ok.xml'), () => new Error('Request timeout')));

        const [, error] = await generateMdaApp(requestor, { ...OPTIONS, timeoutMs: 1000 });

        expect(error?.message).toContain('may still be generating');
    });

    it('reports an SAP error from the generate call', async () => {
        const exception = '<?xml version="1.0" encoding="utf-8"?><exc:exception xmlns:exc="http://www.sap.com/abapxml/types/communicationframework"><message lang="EN">Query ZSNAP_F70S_Q01 is not active</message></exc:exception>';
        const { requestor } = recorder(generator(fixture('mda-validation-ok.xml'), () => xml(exception, 400)));

        const [, error] = await generateMdaApp(requestor, OPTIONS);

        expect(error?.message).toBe('MDA app generation failed: Query ZSNAP_F70S_Q01 is not active');
    });

    it('refuses missing or too long names before any request', async () => {
        const { requestor, calls } = recorder(generator(fixture('mda-validation-ok.xml')));

        const [, missing] = await generateMdaApp(requestor, { ...OPTIONS, serviceBinding: ' ' });
        const [, tooLong] = await generateMdaApp(requestor, { ...OPTIONS, appDescriptor: 'Z'.repeat(33) });

        expect(missing?.message).toContain('service binding is required');
        expect(tooLong?.message).toContain('longer than 32 characters');
        expect(calls).toHaveLength(0);
    });

    it('needs a session through the client method', async () => {
        const { requestor } = recorder(generator(fixture('mda-validation-ok.xml')));

        const [, error] = await clientGenerate({ session: null } as unknown as ClientState, requestor, OPTIONS);

        expect(error?.message).toBe('Not logged in');
    });
});
