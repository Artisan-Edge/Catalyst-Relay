/**
 * Generate MDA App — run the Multidimensional Analysis app generator for an analytical query
 *
 * Creates the UIAD, app variant, InA SRVD and SRVB and (optionally) the IAM app in one call.
 * Validation runs first: a set that already exists is skipped, a partial set is an error.
 */

import type { AsyncResult, Result } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { AdtRequestor } from '../types';
import type { MdaAppOptions, MdaAppValidation, MdaGenerateResult, MdaGeneratedObject } from './types';
import { safeParseXml } from '../../utils/xml';
import { checkResponse } from '../helpers';
import { REQUEST_TIMEOUT_MESSAGE } from '../../utils/headers';
import { MDA_PATH, CONTENT_TYPE, ADTCORE_NS, buildMdaContent, checkMdaOptions, generatorParams, objectNames, STATELESS } from './helpers';
import { validateMdaApp } from './validateMdaApp';
import { previewMdaApp } from './previewMdaApp';

const ACCEPT = 'application/vnd.sap.adt.repository.generator.v1+json, application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.StatusMessage, */*';
const DEFAULT_TIMEOUT_MS = 300_000;

/**
 * Validate, preview (for the app variant name), then generate unless the whole set exists.
 *
 * @param client - ADT client
 * @param options - Generator options (every object name is the caller's)
 * @returns What was generated or found, with the app variant system name, or error
 */
export async function generateMdaApp(client: AdtRequestor, options: MdaAppOptions): AsyncResult<MdaGenerateResult, Error> {
    const [, optionsErr] = checkMdaOptions(options);
    if (optionsErr) return err(optionsErr);

    const [validation, validationErr] = await validateMdaApp(client, options);
    if (validationErr) return err(validationErr);
    const [, refusal] = refuseInvalidSet(validation, options);
    if (refusal) return err(refusal);

    const [preview, previewErr] = await previewMdaApp(client, options);
    if (previewErr) return err(previewErr);

    const names = objectNames(options);
    const result: MdaGenerateResult = {
        status: 'present',
        appDescriptor: names.appDescriptor,
        appVariantId: names.appVariant,
        appVariant: preview.appVariant,
        serviceDefinition: names.serviceDefinition,
        serviceBinding: names.serviceBinding,
        iamApp: options.iamApp ? names.iamApp : null,
        generated: [],
        messages: validation.messages,
        steps: { validate: 'DONE', preview: 'DONE', generate: 'SKIPPED' },
    };
    if (validation.set === 'present') return ok(result);

    const params = generatorParams(options);
    if (options.transport) params['corrNr'] = options.transport;
    const [response, requestErr] = await client.request({
        method: 'POST',
        path: MDA_PATH,
        params,
        headers: { 'Content-Type': CONTENT_TYPE, 'Accept': ACCEPT, ...STATELESS },
        body: buildMdaContent(options),
        timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    });
    if (requestErr?.message === REQUEST_TIMEOUT_MESSAGE) {
        return err(new Error(`MDA app generation timed out; SAP may still be generating. Re-run: validation reports the set as present (skipped) or partial`));
    }
    const [text, checkErr] = await checkResponse(response, requestErr, 'MDA app generation failed', CONTENT_TYPE);
    if (checkErr) return err(checkErr);

    const [generated, parseErr] = parseGeneratedObjects(text);
    if (parseErr) return err(parseErr);
    return ok({ ...result, status: 'created', generated, steps: { ...result.steps, generate: 'DONE' } });
}

/**
 * Parse the generate response (adtcore:objectReferences, though served as generator JSON).
 *
 * @param xml - adtcore:objectReferences
 * @returns The generated objects or error
 */
export function parseGeneratedObjects(xml: string): Result<MdaGeneratedObject[], Error> {
    const [doc, parseErr] = safeParseXml(xml);
    if (parseErr) return err(new Error(`MDA app generation: unexpected response: ${xml.slice(0, 200)}`));
    if (doc.documentElement?.localName !== 'objectReferences') return err(new Error(`MDA app generation: unexpected response: ${xml.slice(0, 200)}`));

    const objects: MdaGeneratedObject[] = [];
    const references = doc.getElementsByTagNameNS(ADTCORE_NS, 'objectReference');
    for (let i = 0; i < references.length; i++) {
        const reference = references[i];
        if (!reference) continue;
        objects.push({
            name: reference.getAttributeNS(ADTCORE_NS, 'name') ?? '',
            type: reference.getAttributeNS(ADTCORE_NS, 'type') ?? '',
            uri: reference.getAttributeNS(ADTCORE_NS, 'uri') ?? '',
        });
    }
    return ok(objects);
}

// Any error other than "already exists", or a set that only partly exists, stops the run
function refuseInvalidSet(validation: MdaAppValidation, options: MdaAppOptions): Result<void, Error> {
    if (validation.errors.length > 0) return err(new Error(`MDA app validation failed: ${validation.errors.join('; ')}`));
    if (validation.set !== 'partial') return ok(undefined);

    const names = objectNames(options);
    const describe = (kinds: MdaAppValidation['existing']): string => kinds.map(kind => `${kind} ${names[kind]}`).join(', ');
    const missing = validation.expected.filter(kind => !validation.existing.includes(kind));
    return err(new Error(`MDA app set is partly present (exists: ${describe(validation.existing)}; missing: ${describe(missing)}); delete the existing objects or pick other names; nothing was generated`));
}
