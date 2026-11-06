/**
 * Preview MDA App — the objects the generator would create, including the app variant's system name
 *
 * The generate response leaves out the app variant (ADVC/LRP); the preview lists it, and its
 * system name is the same for the same appVariantId, also when the set already exists.
 */

import type { AsyncResult, Result } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { AdtRequestor } from '../types';
import type { MdaAppOptions, MdaAppPreview } from './types';
import { safeParseXml } from '../../utils/xml';
import { checkResponse } from '../helpers';
import { MDA_PATH, CONTENT_TYPE, ADTCORE_NS, buildMdaContent, checkMdaOptions, generatorParams, STATELESS } from './helpers';

const MASS_OPERATION_NS = 'http://www.sap.com/adt/massoperation';
const ACCEPT = 'application/vnd.sap.adt.repository.objects.massoperation.v1+xml';
const APP_VARIANT_TYPE = 'ADVC/LRP';
const OPERATION_KEY = 'Operation';

/**
 * Preview the generator's objects for the options.
 *
 * @param client - ADT client
 * @param options - Generator options
 * @returns Planned objects and the app variant system name, or error
 */
export async function previewMdaApp(client: AdtRequestor, options: MdaAppOptions): AsyncResult<MdaAppPreview, Error> {
    const [, optionsErr] = checkMdaOptions(options);
    if (optionsErr) return err(optionsErr);

    const [response, requestErr] = await client.request({
        method: 'POST',
        path: `${MDA_PATH}/preview`,
        params: generatorParams(options),
        headers: { 'Content-Type': CONTENT_TYPE, 'Accept': ACCEPT, ...STATELESS },
        body: buildMdaContent(options),
    });
    const [text, checkErr] = await checkResponse(response, requestErr, 'MDA app preview failed', ACCEPT);
    if (checkErr) return err(checkErr);
    return parseMdaPreview(text);
}

/**
 * Parse a massOperation preview.
 *
 * @param xml - massOperation:group
 * @returns Planned objects and the app variant system name, or error
 */
export function parseMdaPreview(xml: string): Result<MdaAppPreview, Error> {
    const [doc, parseErr] = safeParseXml(xml);
    if (parseErr) return err(parseErr);
    if (doc.documentElement?.namespaceURI !== MASS_OPERATION_NS) return err(new Error(`MDA app preview: unexpected response: ${xml.slice(0, 200)}`));

    const objects: MdaAppPreview['objects'] = [];
    const entries = doc.getElementsByTagNameNS(MASS_OPERATION_NS, 'object');
    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        if (!entry) continue;
        const reference = entry.getElementsByTagNameNS(MASS_OPERATION_NS, 'objectReference')[0];
        if (!reference) continue;
        objects.push({
            name: reference.getAttributeNS(ADTCORE_NS, 'name') ?? '',
            type: reference.getAttributeNS(ADTCORE_NS, 'type') ?? '',
            uri: reference.getAttributeNS(ADTCORE_NS, 'uri') ?? '',
            operation: operationOf(entry),
        });
    }
    const appVariant = objects.find(object => object.type === APP_VARIANT_TYPE)?.name || null;
    return ok({ objects, appVariant });
}

function operationOf(entry: Element): string {
    const properties = entry.getElementsByTagNameNS(MASS_OPERATION_NS, 'property');
    for (let i = 0; i < properties.length; i++) {
        const property = properties[i];
        if (property?.getAttributeNS(MASS_OPERATION_NS, 'key') === OPERATION_KEY) return property.textContent?.trim() ?? '';
    }
    return '';
}
