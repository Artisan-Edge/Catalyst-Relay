/**
 * Read — read a service binding's definition and publish state
 */

import type { AsyncResult, Result } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { AdtRequestor } from '../types';
import type { ServiceBindingInfo } from './types';
import { safeParseXml } from '../../utils/xml';
import { checkResponse } from '../helpers';
import { bindingPath, bindingCategoryFromCode, BINDING_ACCEPT_HEADER } from './helpers';

const NOT_FOUND_STATUS = 404;
const SRVB_NS = 'http://www.sap.com/adt/ddic/ServiceBindings';
const ADTCORE_NS = 'http://www.sap.com/adt/core';
const ACTIVE_VERSION = 'active';

/**
 * Read a service binding.
 *
 * @param client - ADT client
 * @param bindingName - Service binding name
 * @returns The binding, null when it does not exist, or error
 */
export async function readServiceBinding(
    client: AdtRequestor,
    bindingName: string
): AsyncResult<ServiceBindingInfo | null, Error> {
    const [response, requestErr] = await client.request({
        method: 'GET',
        path: bindingPath(bindingName),
        headers: { 'Accept': BINDING_ACCEPT_HEADER },
    });
    if (!requestErr && response?.status === NOT_FOUND_STATUS) return ok(null);

    const [text, checkErr] = await checkResponse(
        response,
        requestErr,
        `Failed to read service binding ${bindingName}`
    );
    if (checkErr) return err(checkErr);

    return parseServiceBinding(text, bindingName);
}

/**
 * Parse the servicebinding.v2 document.
 *
 * @param xml - Response body
 * @param bindingName - Service binding name (for error messages)
 * @returns The binding or error
 */
export function parseServiceBinding(xml: string, bindingName: string): Result<ServiceBindingInfo, Error> {
    const [doc, parseErr] = safeParseXml(xml);
    if (parseErr) return err(parseErr);

    const root = doc.documentElement;
    if (!root || root.localName !== 'serviceBinding') {
        return err(new Error(`Service binding ${bindingName} response is not a service binding document`));
    }

    const published = root.getAttributeNS(SRVB_NS, 'published');
    if (published !== 'true' && published !== 'false') {
        return err(new Error(`Service binding ${bindingName} response carries no publish state`));
    }

    const binding = root.getElementsByTagNameNS(SRVB_NS, 'binding')[0];
    if (!binding) return err(new Error(`Service binding ${bindingName} response has no srvb:binding element`));

    const categoryCode = binding.getAttributeNS(SRVB_NS, 'category') ?? '';
    const category = bindingCategoryFromCode(categoryCode);
    if (!category) return err(new Error(`Service binding ${bindingName} has an unknown category '${categoryCode}'`));

    const services = root.getElementsByTagNameNS(SRVB_NS, 'services')[0];
    const content = root.getElementsByTagNameNS(SRVB_NS, 'content')[0];
    const definition = root.getElementsByTagNameNS(SRVB_NS, 'serviceDefinition')[0];
    const packageRef = root.getElementsByTagNameNS(ADTCORE_NS, 'packageRef')[0];

    return ok({
        name: root.getAttributeNS(ADTCORE_NS, 'name') || bindingName.toUpperCase(),
        description: root.getAttributeNS(ADTCORE_NS, 'description') ?? '',
        packageName: packageRef?.getAttributeNS(ADTCORE_NS, 'name') ?? '',
        serviceName: services?.getAttributeNS(SRVB_NS, 'name') ?? '',
        serviceDefinition: definition?.getAttributeNS(ADTCORE_NS, 'name') ?? '',
        serviceVersion: content?.getAttributeNS(SRVB_NS, 'version') ?? '',
        bindingType: binding.getAttributeNS(SRVB_NS, 'type') ?? '',
        odataVersion: binding.getAttributeNS(SRVB_NS, 'version') ?? '',
        category,
        published: published === 'true',
        active: root.getAttributeNS(ADTCORE_NS, 'version') === ACTIVE_VERSION,
        releaseState: content?.getAttributeNS(SRVB_NS, 'releaseState') ?? '',
    });
}
