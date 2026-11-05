// Find which kind of object owns a text pool of a given name

import type { AsyncResult } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { AdtRequestor } from '../types';
import { checkResponse } from '../helpers';
import type { TextElementsOwner, TextElementsOwnerKind } from './types';
import { TEXT_ELEMENTS_METADATA_TYPE } from './types';
import { textElementsUri } from './helpers';

const NOT_FOUND = 404;
const RESOLUTION_ORDER: readonly TextElementsOwnerKind[] = ['program', 'class', 'functionGroup'];

/**
 * Probe the text pool metadata as a program, then a class, then a function group; the first that
 * exists wins (a program and a class can share a name, in which case the program is returned).
 */
export async function resolveTextElementsOwner(client: AdtRequestor, name: string): AsyncResult<TextElementsOwner, Error> {
    for (const kind of RESOLUTION_ORDER) {
        const owner: TextElementsOwner = { kind, name: name.toUpperCase() };
        const [response, requestErr] = await client.request({
            method: 'GET',
            path: textElementsUri(owner),
            headers: { 'Accept': TEXT_ELEMENTS_METADATA_TYPE },
        });
        if (requestErr) return err(requestErr);
        if (response.ok) return ok(owner);
        if (response.status === NOT_FOUND) continue;

        const [, checkErr] = await checkResponse(response, null, `Failed to look up text elements of ${owner.name}`, TEXT_ELEMENTS_METADATA_TYPE);
        return err(checkErr ?? new Error(`Failed to look up text elements of ${owner.name}: HTTP ${response.status}`));
    }
    return err(new Error(`No program, class or function group named ${name.toUpperCase()}`));
}
