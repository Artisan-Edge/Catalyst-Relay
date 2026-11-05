// Write text pool parts: lock the pool, PUT each part, unlock (the parts stay inactive)

import type { AsyncResult, Result } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { AdtRequestor } from '../types';
import { checkResponse } from '../helpers';
import { withLock } from '../craud/withLock';
import type { TextElementsOwner, TextElementsPart, TextElementsParts } from './types';
import { ALL_TEXT_ELEMENT_PARTS, TEXT_ELEMENTS_KINDS, TEXT_ELEMENTS_PART_LABELS } from './types';
import { textElementsMediaType, textElementsUri } from './helpers';
import { parseTextElements } from './parseTextElements';
import { serializeTextElements } from './serializeTextElements';
import { validateTextElements } from './validateTextElements';

const CRLF = '\r\n';

export interface TextElementsWriteResult {
    owner: TextElementsOwner;
    parts: TextElementsPart[];
}

/**
 * Replace the given parts of a text pool. Each part's text is parsed, validated and re-serialized
 * first (placeholders dropped), so nothing is sent when any part is invalid. A PUT replaces every
 * entry of its part. Activate afterwards with activateTextElements: activating the owner does not
 * activate its texts.
 */
export async function writeTextElements(client: AdtRequestor, owner: TextElementsOwner, parts: TextElementsParts, transport?: string): AsyncResult<TextElementsWriteResult, Error> {
    const config = TEXT_ELEMENTS_KINDS[owner.kind];
    const [bodies, bodyErr] = prepareBodies(owner, parts);
    if (bodyErr) return err(bodyErr);
    if (bodies.length === 0) return err(new Error('No text element parts to write'));

    const uri = textElementsUri(owner);
    const label = `${config.label} ${owner.name.toUpperCase()}`;

    const [, putErr] = await withLock(client, { uri, label: `text elements of ${label}` }, lockHandle => putParts(client, uri, label, bodies, lockHandle, transport));
    if (putErr) return err(putErr);
    return ok({ owner, parts: bodies.map(body => body.part) });
}

interface PartBody {
    part: TextElementsPart;
    body: string;
}

function prepareBodies(owner: TextElementsOwner, parts: TextElementsParts): Result<PartBody[], Error> {
    const config = TEXT_ELEMENTS_KINDS[owner.kind];
    const bodies: PartBody[] = [];

    for (const part of ALL_TEXT_ELEMENT_PARTS) {
        const text = parts[part];
        if (text === undefined) continue;
        if (!config.parts.includes(part)) return err(new Error(`A ${config.label} has no ${TEXT_ELEMENTS_PART_LABELS[part]}`));

        const [entries, parseErr] = parseTextElements(part, text);
        if (parseErr) return err(new Error(`${TEXT_ELEMENTS_PART_LABELS[part]}: ${parseErr.message}`));

        const [, validErr] = validateTextElements(part, entries);
        if (validErr) return err(new Error(`${TEXT_ELEMENTS_PART_LABELS[part]}: ${validErr.message}`));

        bodies.push({ part, body: serializeTextElements(part, entries, CRLF) });
    }
    return ok(bodies);
}

async function putParts(client: AdtRequestor, uri: string, label: string, bodies: PartBody[], lockHandle: string, transport: string | undefined): AsyncResult<void, Error> {
    const params: Record<string, string> = { 'lockHandle': lockHandle };
    if (transport) params['corrNr'] = transport;

    for (const { part, body } of bodies) {
        const mediaType = textElementsMediaType(part);
        // Accept must be the part's media type: text/plain is answered 406 even though the write lands
        const [response, requestErr] = await client.request({
            method: 'PUT',
            path: `${uri}/source/${part}`,
            params,
            headers: { 'Content-Type': `${mediaType}; charset=utf-8`, 'Accept': mediaType },
            body,
        });
        const [, checkErr] = await checkResponse(response, requestErr, `Failed to write ${TEXT_ELEMENTS_PART_LABELS[part]} of ${label}`, mediaType);
        if (checkErr) return err(checkErr);
    }
    return ok(undefined);
}
