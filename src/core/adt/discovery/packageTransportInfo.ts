/**
 * Package Transport Info — look up whether a package is transportable
 */

import type { AsyncResult } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { AdtRequestor } from '../types';
import { checkResponse } from '../helpers';
import { safeParseXml } from '../../utils/xml';

const PAK_NS = 'http://www.sap.com/adt/packages';

/**
 * Transport-related attributes of a package.
 */
export interface PackageTransportInfo {
    /** Software component (e.g. ZLOCAL, HOME). */
    softwareComponent: string;
    /** True when changes are recorded on transports; false for local packages. */
    recordChanges: boolean;
}

/**
 * Get the transport-related attributes of a package.
 *
 * @param client - ADT client
 * @param packageName - Package name (e.g. ZSNAP, $TMP)
 * @returns Software component and change recording, or error
 */
export async function getPackageTransportInfo(
    client: AdtRequestor,
    packageName: string
): AsyncResult<PackageTransportInfo, Error> {
    const [response, requestErr] = await client.request({
        method: 'GET',
        path: `/sap/bc/adt/packages/${encodeURIComponent(packageName.toLowerCase())}`,
        headers: { 'Accept': 'application/vnd.sap.adt.packages.v2+xml, application/vnd.sap.adt.packages.v1+xml' },
    });
    const [text, checkErr] = await checkResponse(response, requestErr, `Failed to read package ${packageName}`);
    if (checkErr) return err(checkErr);

    const [doc, parseErr] = safeParseXml(text);
    if (parseErr) return err(parseErr);

    const attributes = doc.getElementsByTagNameNS(PAK_NS, 'attributes')[0];
    const component = doc.getElementsByTagNameNS(PAK_NS, 'softwareComponent')[0];
    const recordChanges = attr(attributes, 'recordChanges');
    const softwareComponent = attr(component, 'name');
    if (!recordChanges || !softwareComponent) return err(new Error(`No transport attributes found for package ${packageName}`));

    return ok({ softwareComponent, recordChanges: recordChanges === 'true' });
}

// Namespaced attribute value, falling back to the prefixed name.
function attr(el: Element | undefined, name: string): string | null {
    if (!el) return null;
    return el.getAttributeNS(PAK_NS, name) || el.getAttribute(`pak:${name}`) || null;
}
