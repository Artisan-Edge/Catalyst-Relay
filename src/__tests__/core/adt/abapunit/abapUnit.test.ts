/**
 * Unit Tests for ABAP Unit runs: the run configuration body, result parsing (alerts at program,
 * class and method level), the summary, metadata parsing and the request runUnitTests sends.
 *
 * Result fixtures (.aunit: the XML bodies; *.xml is gitignored) are real responses captured from an S/4HANA system (SAP_BASIS 758).
 */

import { describe, it, expect } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { runUnitTests } from '../../../../core/adt';
import type { AdtRequestor } from '../../../../core/adt';
import { buildRunConfiguration } from '../../../../core/adt/abapunit/buildRunConfiguration';
import { parseRunResult } from '../../../../core/adt/abapunit/parseRunResult';
import { parseUnitTestMetadata } from '../../../../core/adt/abapunit/getUnitTestMetadata';
import type { UnitTestRunResult } from '../../../../core/adt';

const FIXTURES = path.join(import.meta.dir, '../../../fixtures/abapunit');

function parsed(name: string): UnitTestRunResult {
    const [result, error] = parseRunResult(fs.readFileSync(path.join(FIXTURES, name), 'utf8'));
    if (error) throw error;
    return result;
}

describe('buildRunConfiguration', () => {
    it('lists every URI and flags exactly the requested levels', () => {
        const xml = buildRunConfiguration(['/sap/bc/adt/oo/classes/zcl_a', '/sap/bc/adt/packages/%24tmp'], ['harmless'], ['short', 'long']);
        expect(xml).toContain('<testRiskLevels harmless="true" dangerous="false" critical="false"/>');
        expect(xml).toContain('<testDurations short="true" medium="false" long="true"/>');
        expect(xml).toContain('<adtcore:objectReference adtcore:uri="/sap/bc/adt/oo/classes/zcl_a"/>');
        expect(xml).toContain('<adtcore:objectReference adtcore:uri="/sap/bc/adt/packages/%24tmp"/>');
        expect(xml).toContain('<objectSet kind="inclusive">');
    });
});

describe('parseRunResult', () => {
    it('parses a failed assertion with nested details and its stack position', () => {
        const result = parsed('failedAssertion.aunit');
        const program = result.programs[0]!;
        expect(program).toMatchObject({ name: 'ZCAT_PRB_AUNIT', type: 'CLAS/OC', hasSyntaxErrors: false });

        const [fails, passes] = program.testClasses[0]!.methods;
        expect(fails).toMatchObject({ name: 'FAILS', status: 'failed', executionTime: 0.06 });
        expect(passes).toMatchObject({ name: 'PASSES', status: 'passed', alerts: [] });

        const alert = fails!.alerts[0]!;
        expect(alert.title).toBe("Critical Assertion Error: 'deliberate failure'");
        expect(alert.details).toEqual(['Different values', '  Expected [5] Actual [4]', "Test 'LTC_ADD->FAILS' in Main Program 'ZCAT_PRB_AUNIT================CP'"]);
        expect(alert.stack[0]).toMatchObject({ line: 12, column: 0, uri: '/sap/bc/adt/oo/classes/zcat_prb_aunit/includes/testclasses#start=12,0' });

        expect(result.summary).toMatchObject({ programs: 1, testClasses: 1, methods: 2, passed: 1, failed: 1, errors: 0, failingAlerts: 1, success: false });
    });

    it('counts an exception as an error and a risk-level warning class as skipped', () => {
        const result = parsed('exceptionAndSkipped.aunit');
        const [add, danger] = result.programs[0]!.testClasses;
        expect(add!.methods.find(method => method.name === 'DUMPS')?.status).toBe('error');
        expect(danger).toMatchObject({ name: 'LTC_DANGER', riskLevel: 'dangerous', methods: [] });
        expect(danger!.alerts[0]).toMatchObject({ kind: 'warning', title: 'No execution, risk level of test class exceeds upper limit' });

        expect(result.summary).toMatchObject({ testClasses: 2, methods: 2, passed: 1, failed: 0, errors: 1, skippedClasses: 1, failingAlerts: 1, success: false });
    });

    it('fails a run where a program has syntax errors, even when every method passed', () => {
        const result = parsed('syntaxErrorAndPass.aunit');
        const [broken, config] = result.programs;
        expect(broken).toMatchObject({ name: 'ZCSNAP_F72S_205', hasSyntaxErrors: true, testClasses: [] });
        expect(broken!.alerts[0]!.stack[0]!.line).toBe(11);
        expect(config!.testClasses).toHaveLength(3);

        expect(result.summary).toMatchObject({ programs: 2, testClasses: 3, methods: 21, methodsRun: 21, passed: 21, syntaxErrors: 1, failingAlerts: 0, success: false });
    });

    it('does not count an empty run as a success (nothing ran)', () => {
        const [result] = parseRunResult('<?xml version="1.0"?><aunit:runResult xmlns:aunit="http://www.sap.com/adt/aunit"/>');
        expect(result?.programs).toEqual([]);
        expect(result?.summary).toMatchObject({ methodsRun: 0, failingAlerts: 0, objectsWithoutResults: [], success: false });
    });

    it('counts a run where only skipped classes exist as not run', () => {
        const xml = '<?xml version="1.0"?><aunit:runResult xmlns:aunit="http://www.sap.com/adt/aunit" xmlns:adtcore="http://www.sap.com/adt/core"><program adtcore:name="ZCL_A" adtcore:uri="/sap/bc/adt/oo/classes/zcl_a"><testClasses><testClass adtcore:name="LTC" riskLevel="critical"><alerts><alert kind="warning" severity="tolerable"><title>No execution, risk level of test class exceeds upper limit</title></alert></alerts></testClass></testClasses></program></aunit:runResult>';
        const [result] = parseRunResult(xml);
        expect(result?.summary).toMatchObject({ methodsRun: 0, skippedClasses: 1, success: false });
    });

    it('passes when methods ran, none failed and nothing has syntax errors', () => {
        const xml = '<?xml version="1.0"?><aunit:runResult xmlns:aunit="http://www.sap.com/adt/aunit" xmlns:adtcore="http://www.sap.com/adt/core"><program adtcore:name="ZCL_A" adtcore:uri="/sap/bc/adt/oo/classes/zcl_a"><testClasses><testClass adtcore:name="LTC"><testMethods><testMethod adtcore:name="OK" executionTime="0.01"/></testMethods></testClass></testClasses></program></aunit:runResult>';
        expect(parseRunResult(xml)[0]?.summary).toMatchObject({ methodsRun: 1, passed: 1, success: true });
    });

    it('rejects a response that is not a run result', () => {
        expect(parseRunResult('<exc:exception xmlns:exc="x"/>')[1]?.message).toContain('Unexpected ABAP Unit response');
    });
});

describe('parseUnitTestMetadata', () => {
    it('reads the client setup and user authorization', () => {
        const xml = '<?xml version="1.0"?><aunit:metadata xmlns:aunit="http://www.sap.com/adt/aunit"><aunit:supportedTypeFeatures globalWorkbenchType="CLAS/OC" ownTests="true"/><aunit:clientSetup maxRiskLevel="harmless" executionDenied="false"/><aunit:userAuthorization executionDenied="true"/></aunit:metadata>';
        expect(parseUnitTestMetadata(xml)).toEqual([{ maxRiskLevel: 'harmless', executionDenied: false, userExecutionDenied: true }, null]);
    });
});

describe('runUnitTests', () => {
    it('posts the run to testruns with the exact result media type and a long timeout', async () => {
        const sent: { path: string; headers: Record<string, string> | undefined; body: string | undefined; timeout: number | undefined }[] = [];
        const requestor: AdtRequestor = {
            request: async (options) => {
                sent.push({ path: options.path, headers: options.headers, body: options.body, timeout: options.timeout });
                return [new Response(fs.readFileSync(path.join(FIXTURES, 'failedAssertion.aunit'), 'utf8'), { status: 200 }), null];
            },
        };

        const [result, error] = await runUnitTests(requestor, { objects: [{ name: 'ZCL_A', extension: 'aclass' }], packages: ['$TMP'] });
        expect(error).toBeNull();
        expect(result?.summary.failed).toBe(1);

        expect(sent[0]!.path).toBe('/sap/bc/adt/abapunit/testruns');
        expect(sent[0]!.headers).toEqual({
            'Content-Type': 'application/vnd.sap.adt.abapunit.testruns.config.v4+xml',
            'Accept': 'application/vnd.sap.adt.abapunit.testruns.result.v2+xml',
        });
        expect(sent[0]!.timeout).toBe(600_000);
        expect(sent[0]!.body).toContain('adtcore:uri="/sap/bc/adt/oo/classes/zcl_a"');
        expect(sent[0]!.body).toContain('adtcore:uri="/sap/bc/adt/packages/%24tmp"');
        // ADT defaults
        expect(sent[0]!.body).toContain('<testRiskLevels harmless="true" dangerous="true" critical="false"/>');
        expect(sent[0]!.body).toContain('<testDurations short="true" medium="true" long="false"/>');
    });

    it('lists requested objects SAP returned nothing for (missing, or without tests)', async () => {
        const requestor: AdtRequestor = {
            request: async () => [new Response(fs.readFileSync(path.join(FIXTURES, 'failedAssertion.aunit'), 'utf8'), { status: 200 }), null],
        };
        const [result] = await runUnitTests(requestor, { objects: [{ name: 'ZCAT_PRB_AUNIT', extension: 'aclass' }, { name: 'ZCL_MISSING', extension: 'aclass' }] });
        expect(result?.summary.objectsWithoutResults).toEqual(['ZCL_MISSING.aclass']);
    });

    it('reports an unsupported result media type as a release limitation', async () => {
        const body = '<?xml version="1.0" encoding="utf-8"?><exc:exception xmlns:exc="http://www.sap.com/abapxml/types/communicationframework"><namespace id="com.sap.adt"/><type id="ExceptionResourceNotAcceptable"/><message lang="EN">The message content is not acceptable.</message></exc:exception>';
        const requestor: AdtRequestor = { request: async () => [new Response(body, { status: 406 }), null] };
        const [, error] = await runUnitTests(requestor, { packages: ['Z'] });
        expect(error?.message).toContain('not supported on this SAP release');
        expect(error?.message).toContain('application/vnd.sap.adt.abapunit.testruns.result.v2+xml');
    });

    it('needs something to test', async () => {
        const requestor: AdtRequestor = { request: async () => [new Response('', { status: 200 }), null] };
        expect((await runUnitTests(requestor, {}))[1]?.message).toBe('No objects or packages to test');
        expect((await runUnitTests(requestor, { packages: ['Z'], riskLevels: [] }))[1]?.message).toContain('risk level');
    });
});
