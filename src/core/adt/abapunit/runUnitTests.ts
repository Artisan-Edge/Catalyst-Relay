// Run ABAP Unit tests (synchronous POST /sap/bc/adt/abapunit/testruns)

import type { AsyncResult } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { AdtRequestor } from '../types';
import { checkResponse, objectUri, requireConfig } from '../helpers';
import type { ObjectRef } from '../../../types/requests';
import type { UnitTestProgram, UnitTestRunOptions, UnitTestRunResult } from './types';
import { DEFAULT_UNIT_TEST_DURATIONS, DEFAULT_UNIT_TEST_RISK_LEVELS } from './types';
import { buildRunConfiguration } from './buildRunConfiguration';
import { parseRunResult } from './parseRunResult';

const CONFIG_MEDIA_TYPE = 'application/vnd.sap.adt.abapunit.testruns.config.v4+xml';
// Any other Accept (even application/xml) is refused
const RESULT_MEDIA_TYPE = 'application/vnd.sap.adt.abapunit.testruns.result.v2+xml';
const PACKAGES_ROOT = '/sap/bc/adt/packages';
// The run blocks until every test finished; a package of a dozen classes takes ~10 s
const DEFAULT_TIMEOUT_MS = 600_000;

/**
 * Run the tests of objects and/or packages. The response is always HTTP 200; failures are alerts in
 * the result. summary.success is false when an assertion failed or an exception occurred, when no
 * test method ran, or when a program has syntax errors; summary.objectsWithoutResults lists the
 * requested objects SAP returned nothing for.
 */
export async function runUnitTests(client: AdtRequestor, options: UnitTestRunOptions): AsyncResult<UnitTestRunResult, Error> {
    const uris: string[] = [];
    const requested: RequestedObject[] = [];
    for (const object of options.objects ?? []) {
        const [config, configErr] = requireConfig(object.extension);
        if (configErr) return err(configErr);
        const [uri, uriErr] = objectUri(config, object);
        if (uriErr) return err(uriErr);
        uris.push(uri);
        requested.push({ object, uri });
    }
    for (const pkg of options.packages ?? []) {
        uris.push(`${PACKAGES_ROOT}/${encodeURIComponent(pkg.toLowerCase())}`);
    }
    if (uris.length === 0) return err(new Error('No objects or packages to test'));

    const riskLevels = options.riskLevels ?? DEFAULT_UNIT_TEST_RISK_LEVELS;
    const durations = options.durations ?? DEFAULT_UNIT_TEST_DURATIONS;
    if (riskLevels.length === 0) return err(new Error('At least one risk level is required'));
    if (durations.length === 0) return err(new Error('At least one duration is required'));

    const [response, requestErr] = await client.request({
        method: 'POST',
        path: '/sap/bc/adt/abapunit/testruns',
        headers: { 'Content-Type': CONFIG_MEDIA_TYPE, 'Accept': RESULT_MEDIA_TYPE },
        body: buildRunConfiguration(uris, riskLevels, durations),
        timeout: options.timeout ?? DEFAULT_TIMEOUT_MS,
    });
    const [text, checkErr] = await checkResponse(response, requestErr, 'ABAP Unit run failed', RESULT_MEDIA_TYPE);
    if (checkErr) return err(checkErr);

    const [result, parseErr] = parseRunResult(text);
    if (parseErr) return err(new Error(`Failed to parse ABAP Unit result: ${parseErr.message}`));
    const objectsWithoutResults = requested.filter(entry => !hasResult(entry, result.programs)).map(entry => `${entry.object.name.toUpperCase()}.${entry.object.extension}`);
    return ok({ ...result, summary: { ...result.summary, objectsWithoutResults } });
}

interface RequestedObject {
    object: ObjectRef;
    uri: string;
}

// A program answers for an object when it is the object, or one URI contains the other
// (a function module or include reports under its function group's program).
function hasResult(entry: RequestedObject, programs: readonly UnitTestProgram[]): boolean {
    const uri = entry.uri.toLowerCase();
    const name = entry.object.name.toUpperCase();
    return programs.some(program => {
        const programUri = program.uri.toLowerCase();
        if (program.name.toUpperCase() === name) return true;
        if (!programUri) return false;
        return uri.startsWith(programUri) || programUri.startsWith(uri);
    });
}
