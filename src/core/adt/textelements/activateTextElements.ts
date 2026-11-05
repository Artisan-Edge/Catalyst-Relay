// Activate text pools (PROG/PX, CLAS/OCX, FUGR/PX); activating their owner does not

import type { AsyncResult, Result } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { AdtRequestor } from '../types';
import type { ActivationMessage, ActivationReference, ActivationResult } from '../craud/activation';
import { checkResponse } from '../helpers';
import { escapeXml, safeParseXml } from '../../utils/xml';
import type { TextElementsOwner } from './types';
import { TEXT_ELEMENTS_EXTENSION, TEXT_ELEMENTS_KINDS } from './types';
import { textElementsUri } from './helpers';

const ERROR_TYPES = new Set(['E', 'A']);

export function textElementsReference(owner: TextElementsOwner): ActivationReference {
    return {
        uri: textElementsUri(owner),
        type: TEXT_ELEMENTS_KINDS[owner.kind].type,
        name: owner.name.toUpperCase(),
        extension: TEXT_ELEMENTS_EXTENSION,
    };
}

/**
 * Activate the text pools in one synchronous run; results carry the 'textelements' extension.
 * The background activation run (/activation/runs) reports success for text pools but leaves them
 * inactive, so this uses the synchronous /activation endpoint instead.
 */
export async function activateTextElements(client: AdtRequestor, owners: readonly TextElementsOwner[]): AsyncResult<ActivationResult[], Error> {
    if (owners.length === 0) return ok([]);

    const references = owners.map(textElementsReference);
    const [response, requestErr] = await client.request({
        method: 'POST',
        path: '/sap/bc/adt/activation',
        params: { 'method': 'activate', 'preauditRequested': 'true' },
        headers: { 'Content-Type': 'application/xml', 'Accept': 'application/xml' },
        body: buildActivationBody(references),
    });
    const [text, checkErr] = await checkResponse(response, requestErr, 'Text elements activation failed');
    if (checkErr) return err(checkErr);
    return parseTextActivation(references, text);
}

export function buildActivationBody(references: readonly ActivationReference[]): string {
    const refs = references
        .map(ref => `<adtcore:objectReference adtcore:uri="${escapeXml(ref.uri)}" adtcore:type="${ref.type}" adtcore:name="${escapeXml(ref.name)}"/>`)
        .join('');
    return `<?xml version="1.0" encoding="UTF-8"?><adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">${refs}</adtcore:objectReferences>`;
}

// <chkl:messages> with <chkl:properties activationExecuted> and <msg type objDescr href><shortText><txt>
export function parseTextActivation(references: readonly ActivationReference[], xml: string): Result<ActivationResult[], Error> {
    // An empty body means nothing to report
    if (!xml.trim()) return ok(references.map(ref => result(ref, [])));

    const [doc, parseErr] = safeParseXml(xml);
    if (parseErr) return err(parseErr);

    const messages = new Map<string, ActivationMessage[]>(references.map(ref => [ref.name, []]));
    const msgElements = doc.getElementsByTagName('msg');
    for (let i = 0; i < msgElements.length; i++) {
        const msg = msgElements[i]!;
        const type = msg.getAttribute('type') ?? '';
        if (type === 'W' || type === 'I') continue;

        const target = owningReference(references, `${msg.getAttribute('objDescr') ?? ''} ${msg.getAttribute('href') ?? ''}`);
        if (!target) continue;

        const texts = msg.getElementsByTagName('txt');
        for (let j = 0; j < texts.length; j++) {
            const text = texts[j]?.textContent;
            if (text) messages.get(target.name)!.push({ severity: ERROR_TYPES.has(type) ? 'error' : 'warning', text });
        }
    }

    // activationExecuted="false" without errors: the pool had no inactive version (already active)
    const properties = doc.getElementsByTagNameNS('*', 'properties')[0];
    const notExecuted = properties?.getAttribute('activationExecuted') === 'false';

    return ok(references.map(ref => {
        const own = messages.get(ref.name) ?? [];
        const hasError = own.some(message => message.severity === 'error');
        if (notExecuted && !hasError) own.push({ severity: 'info', text: 'Nothing to activate: the text elements are already active' });
        return result(ref, own);
    }));
}

function result(ref: ActivationReference, messages: ActivationMessage[]): ActivationResult {
    const status = messages.some(message => message.severity === 'error') ? 'error' : messages.some(message => message.severity === 'warning') ? 'warning' : 'success';
    return { name: ref.name, extension: ref.extension, status, messages };
}

// Longest matching name wins; a single-reference run absorbs messages that name nothing
function owningReference(references: readonly ActivationReference[], haystack: string): ActivationReference | null {
    const lower = haystack.toLowerCase();
    const named = references.filter(ref => lower.includes(ref.name.toLowerCase())).sort((a, b) => b.name.length - a.name.length);
    if (named[0]) return named[0];
    return references.length === 1 ? references[0]! : null;
}
