// ABAP Unit client setup: the highest risk level this client allows, and whether runs are denied

import type { AsyncResult, Result } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { AdtRequestor } from '../types';
import { checkResponse } from '../helpers';
import { safeParseXml } from '../../utils/xml';

const METADATA_MEDIA_TYPE = 'application/vnd.sap.adt.abapunit.metadata.result.v1+xml';

export interface UnitTestMetadata {
    /** harmless | dangerous | critical (empty when the system does not say) */
    maxRiskLevel: string;
    /** The client forbids ABAP Unit runs */
    executionDenied: boolean;
    /** The user may not run ABAP Unit */
    userExecutionDenied: boolean;
}

export async function getUnitTestMetadata(client: AdtRequestor): AsyncResult<UnitTestMetadata, Error> {
    const [response, requestErr] = await client.request({
        method: 'GET',
        path: '/sap/bc/adt/abapunit/metadata',
        headers: { 'Accept': METADATA_MEDIA_TYPE },
    });
    const [text, checkErr] = await checkResponse(response, requestErr, 'Failed to read ABAP Unit metadata');
    if (checkErr) return err(checkErr);
    return parseUnitTestMetadata(text);
}

export function parseUnitTestMetadata(xml: string): Result<UnitTestMetadata, Error> {
    const [doc, parseErr] = safeParseXml(xml);
    if (parseErr) return err(parseErr);

    const setup = firstByLocalName(doc, 'clientSetup');
    const user = firstByLocalName(doc, 'userAuthorization');
    return ok({
        maxRiskLevel: setup?.getAttribute('maxRiskLevel') ?? '',
        executionDenied: setup?.getAttribute('executionDenied') === 'true',
        userExecutionDenied: user?.getAttribute('executionDenied') === 'true',
    });
}

function firstByLocalName(doc: Document, localName: string): Element | null {
    const matches = doc.getElementsByTagNameNS('*', localName);
    return matches[0] ?? null;
}
