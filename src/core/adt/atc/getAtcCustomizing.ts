// ATC customizing: the system's check variant (GET /sap/bc/adt/atc/customizing)

import type { AsyncResult, Result } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { AdtRequestor } from '../types';
import { checkResponse } from '../helpers';
import { safeParseXml } from '../../utils/xml';

const CUSTOMIZING_PATH = '/sap/bc/adt/atc/customizing';
const SYSTEM_CHECK_VARIANT = 'systemCheckVariant';

export interface AtcCustomizing {
    /** The variant ATC runs with when none is named (e.g. ABAP_CLOUD_DEVELOPMENT_DEFAULT) */
    systemCheckVariant: string | null;
    properties: Record<string, string>;
}

export async function getAtcCustomizing(client: AdtRequestor): AsyncResult<AtcCustomizing, Error> {
    const [response, requestErr] = await client.request({
        method: 'GET',
        path: CUSTOMIZING_PATH,
        headers: { 'Accept': 'application/xml' },
    });
    const [text, checkErr] = await checkResponse(response, requestErr, 'Failed to read ATC customizing');
    if (checkErr) return err(checkErr);

    return parseAtcCustomizing(text);
}

export function parseAtcCustomizing(xml: string): Result<AtcCustomizing, Error> {
    const [doc, parseErr] = safeParseXml(xml);
    if (parseErr) return err(parseErr);

    const properties: Record<string, string> = {};
    const elements = doc.getElementsByTagName('property');
    for (let i = 0; i < elements.length; i++) {
        const name = elements[i]?.getAttribute('name');
        if (!name) continue;
        properties[name] = elements[i]?.getAttribute('value') ?? '';
    }

    return ok({ systemCheckVariant: properties[SYSTEM_CHECK_VARIANT] || null, properties });
}
