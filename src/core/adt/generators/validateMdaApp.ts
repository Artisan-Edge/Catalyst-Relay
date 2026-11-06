/**
 * Validate MDA App — the generator's validation, used as the idempotence pre-check
 *
 * With the content JSON, SAP returns one ERROR per object that already exists (its texts carry
 * a typo and a double space, so they are matched loosely), or a single OK.
 */

import type { AsyncResult, Result } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { AdtRequestor } from '../types';
import type { MdaAppOptions, MdaAppValidation, MdaObjectKind, MdaValidationMessage } from './types';
import { safeParseXml } from '../../utils/xml';
import { checkResponse } from '../helpers';
import { MDA_PATH, CONTENT_TYPE, buildMdaContent, checkMdaOptions, expectedKinds, generatorParams, objectNames, STATELESS } from './helpers';

const VALIDATION_NS = 'http://www.sap.com/adt/core/validationMessages';
const ACCEPT = 'application/vnd.sap.adt.validationMessages.v1+xml';
const CHECKS = 'package,referencedobject,authorization';
const ERROR_SEVERITY = 'ERROR';
const ALREADY_EXISTS = /already\s+exists/i;

// "Service defintion with name X already exists" (SAP's typo), "App  descriptor X already exists", ...
const KIND_PATTERNS: Record<MdaObjectKind, RegExp> = {
    serviceBinding: /service\s+binding/i,
    serviceDefinition: /service\s+def\w*tion/i,
    appDescriptor: /app\s+descriptor/i,
    appVariant: /sapui5\s+component\s+id/i,
    iamApp: /iam\s+app/i,
};

/**
 * Run the generator's validation for the options.
 *
 * @param client - ADT client
 * @param options - Generator options
 * @returns The messages and which objects exist, or error
 */
export async function validateMdaApp(client: AdtRequestor, options: MdaAppOptions): AsyncResult<MdaAppValidation, Error> {
    const [, optionsErr] = checkMdaOptions(options);
    if (optionsErr) return err(optionsErr);

    const [response, requestErr] = await client.request({
        method: 'POST',
        path: `${MDA_PATH}/validation`,
        params: { ...generatorParams(options), checks: CHECKS },
        headers: { 'Content-Type': CONTENT_TYPE, 'Accept': ACCEPT, ...STATELESS },
        body: buildMdaContent(options),
    });
    const [text, checkErr] = await checkResponse(response, requestErr, 'MDA app validation failed', ACCEPT);
    if (checkErr) return err(checkErr);

    const [messages, parseErr] = parseValidationMessages(text);
    if (parseErr) return err(parseErr);
    return ok(classifyMdaValidation(messages, options));
}

/**
 * Parse a validationMessages document.
 *
 * @param xml - validationMessages:validationMessages
 * @returns The messages or error
 */
export function parseValidationMessages(xml: string): Result<MdaValidationMessage[], Error> {
    const [doc, parseErr] = safeParseXml(xml);
    if (parseErr) return err(parseErr);
    if (doc.documentElement?.localName !== 'validationMessages') return err(new Error(`MDA app validation: unexpected response: ${xml.slice(0, 200)}`));

    const messages: MdaValidationMessage[] = [];
    const entries = doc.getElementsByTagNameNS(VALIDATION_NS, 'validationMessage');
    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        if (!entry) continue;
        const severity = entry.getElementsByTagNameNS(VALIDATION_NS, 'severity')[0]?.textContent?.trim() ?? '';
        const text = entry.getElementsByTagNameNS(VALIDATION_NS, 'shorttext')[0]?.textContent?.trim() ?? '';
        messages.push({ severity, text });
    }
    return ok(messages);
}

/**
 * Sort ERROR messages into "already exists" per object and other errors; derive the set state.
 *
 * @param messages - Parsed validation messages
 * @param options - Generator options (the names to look for)
 * @returns Validation outcome
 */
export function classifyMdaValidation(messages: MdaValidationMessage[], options: MdaAppOptions): MdaAppValidation {
    const expected = expectedKinds(options);
    const names = objectNames(options);
    const existing: MdaObjectKind[] = [];
    const errors: string[] = [];

    for (const message of messages) {
        if (message.severity.toUpperCase() !== ERROR_SEVERITY) continue;
        const kind = existingKind(message.text, expected, names);
        if (!kind) {
            errors.push(message.text);
            continue;
        }
        if (!existing.includes(kind)) existing.push(kind);
    }

    const set = existing.length === 0 ? 'absent' : existing.length === expected.length ? 'present' : 'partial';
    return { messages: messages.filter(message => message.severity.toUpperCase() !== 'OK'), existing, expected, errors, set };
}

// The object an "already exists" text names: its kind wording and its name (SRVD and SRVB may share one)
function existingKind(text: string, expected: MdaObjectKind[], names: Record<MdaObjectKind, string>): MdaObjectKind | null {
    if (!ALREADY_EXISTS.test(text)) return null;
    const upper = text.toUpperCase();
    return expected.find(kind => KIND_PATTERNS[kind].test(text) && upper.includes(names[kind].toUpperCase())) ?? null;
}
