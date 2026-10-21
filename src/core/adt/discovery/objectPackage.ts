/**
 * Object Package — look up the package an object is currently assigned to
 */

import type { AsyncResult } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { AdtRequestor } from '../types';
import { checkResponse } from '../helpers';
import { safeParseXml } from '../../utils/xml';

// Namespace of the object properties response.
const OPR_NS = 'http://www.sap.com/adt/ris/objectProperties';

/**
 * Get the package an object is assigned to.
 *
 * @param client - ADT client
 * @param objectUri - Object ADT URI (e.g. /sap/bc/adt/ddic/ddl/sources/zview)
 * @returns Package name (upper case) or error when the object has no package
 */
export async function getObjectPackage(
    client: AdtRequestor,
    objectUri: string
): AsyncResult<string, Error> {
    const [response, requestErr] = await client.request({
        method: 'GET',
        path: `/sap/bc/adt/repository/informationsystem/objectproperties/values?uri=${encodeURIComponent(objectUri)}&facet=package`,
    });
    const [text, checkErr] = await checkResponse(response, requestErr, `Failed to read package of ${objectUri}`);
    if (checkErr) return err(checkErr);

    const [doc, parseErr] = safeParseXml(text);
    if (parseErr) return err(parseErr);

    // Package is an attribute on the opr:object element.
    const pkg = doc.getElementsByTagNameNS(OPR_NS, 'object')[0]?.getAttribute('package');
    if (!pkg) return err(new Error(`No package found for ${objectUri}`));

    return ok(pkg.toUpperCase());
}
