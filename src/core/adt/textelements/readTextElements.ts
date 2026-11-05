// Read the parts of a text pool (raw ADT text)

import type { AsyncResult } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { AdtRequestor } from '../types';
import { checkResponse } from '../helpers';
import type { TextElementsOwner, TextElementsPart, TextElementsParts } from './types';
import { TEXT_ELEMENTS_KINDS, TEXT_ELEMENTS_PART_LABELS } from './types';
import { textElementsMediaType, textElementsUri } from './helpers';

const NOT_FOUND = 404;

/**
 * GET each requested part (default: every part the owner kind has). Text is returned as SAP serves
 * it (CRLF, `?...` placeholders); use parseTextElements / canonicalTextElements to work with it.
 */
export async function readTextElements(client: AdtRequestor, owner: TextElementsOwner, parts?: readonly TextElementsPart[]): AsyncResult<TextElementsParts, Error> {
    const config = TEXT_ELEMENTS_KINDS[owner.kind];
    const requested = parts ?? config.parts;
    const unsupported = requested.filter(part => !config.parts.includes(part));
    if (unsupported.length > 0) return err(new Error(`A ${config.label} has no ${unsupported.map(part => TEXT_ELEMENTS_PART_LABELS[part]).join(' or ')}`));

    const base = textElementsUri(owner);
    const result: TextElementsParts = {};
    for (const part of requested) {
        const mediaType = textElementsMediaType(part);
        const [response, requestErr] = await client.request({
            method: 'GET',
            path: `${base}/source/${part}`,
            headers: { 'Accept': mediaType },
        });
        if (response?.status === NOT_FOUND) return err(new Error(`Text elements of ${config.label} ${owner.name.toUpperCase()} not found`));

        const [text, checkErr] = await checkResponse(response, requestErr, `Failed to read ${TEXT_ELEMENTS_PART_LABELS[part]} of ${config.label} ${owner.name.toUpperCase()}`, mediaType);
        if (checkErr) return err(checkErr);
        result[part] = text;
    }
    return ok(result);
}
