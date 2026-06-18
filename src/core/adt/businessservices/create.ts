/**
 * Create — create a service binding object (no source; structured XML)
 */

import type { AsyncResult } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { AdtRequestor } from '../types';
import type { CreateServiceBindingOptions, ServiceBindingType, ServiceBindingVersion } from './types';
import { escapeXml } from '../../utils/xml';
import { checkResponse } from '../helpers';

const SERVICE_BINDING_TYPE_CODE = 'SRVB/SVB';
const BINDING_CATEGORY = '1';
const CONTENT_VERSION = '0001';

/**
 * Create a service binding shell in SAP.
 *
 * Unlike source-based objects, a binding has no source/main — its definition is
 * the structured XML body posted here.
 *
 * @param client - ADT client
 * @param options - Service binding options
 * @param username - Creating user
 * @returns void or error
 */
export async function createServiceBindingObject(
    client: AdtRequestor,
    options: CreateServiceBindingOptions,
    username: string
): AsyncResult<void, Error> {
    const bindingType: ServiceBindingType = options.bindingType ?? 'ODATA';
    const bindingVersion: ServiceBindingVersion = options.bindingVersion ?? 'V4';
    const description = options.description ?? '';
    const bindingName = options.bindingName.toUpperCase();
    const serviceDefinition = options.serviceDefinition.toUpperCase();
    const packageName = options.packageName.toUpperCase();

    // Build the service binding XML body.
    const body = `<?xml version="1.0" encoding="UTF-8"?>
<srvb:serviceBinding xmlns:srvb="http://www.sap.com/adt/ddic/ServiceBindings" xmlns:adtcore="http://www.sap.com/adt/core" adtcore:description="${escapeXml(description)}" adtcore:language="EN" adtcore:name="${bindingName}" adtcore:type="${SERVICE_BINDING_TYPE_CODE}" adtcore:masterLanguage="EN" adtcore:responsible="${username.toUpperCase()}">
  <adtcore:packageRef adtcore:name="${packageName}"/>
  <srvb:services srvb:name="${serviceDefinition}">
    <srvb:content srvb:version="${CONTENT_VERSION}">
      <srvb:serviceDefinition adtcore:name="${serviceDefinition}"/>
    </srvb:content>
  </srvb:services>
  <srvb:binding srvb:category="${BINDING_CATEGORY}" srvb:type="${bindingType}" srvb:version="${bindingVersion}">
    <srvb:implementation adtcore:name=""/>
  </srvb:binding>
</srvb:serviceBinding>`;

    // Add transport parameter if provided.
    const params: Record<string, string> = {};
    if (options.transport) {
        params['corrNr'] = options.transport;
    }

    // Execute create request.
    const [response, requestErr] = await client.request({
        method: 'POST',
        path: '/sap/bc/adt/businessservices/bindings',
        params,
        headers: { 'Content-Type': 'application/*' },
        body,
    });

    // Validate successful response.
    const [, checkErr] = await checkResponse(
        response,
        requestErr,
        `Failed to create service binding ${options.bindingName}`
    );
    if (checkErr) return err(checkErr);

    return ok(undefined);
}
