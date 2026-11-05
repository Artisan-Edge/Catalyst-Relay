/**
 * Validate — pre-flight check for a service binding
 */

import type { AsyncResult } from '../../../types/result';
import { err } from '../../../types/result';
import type { AdtRequestor } from '../types';
import type { CreateServiceBindingOptions, ServiceBindingType, ServiceBindingVersion } from './types';
import { checkResponse } from '../helpers';
import { judgeSeverity, INA_BINDING_TYPE } from './helpers';

/**
 * Validate a service binding before creating it.
 *
 * OK and INFO pass (INFO is advice, e.g. "V4 without draft is primarily read-only");
 * WARNING passes only with options.allowWarnings; ERROR fails. InA is validated as
 * `INA` (`INA\V4` dumps with a 500).
 *
 * @param client - ADT client
 * @param options - Service binding options
 * @returns Notes for a passing INFO/WARNING (empty for OK) or error
 */
export async function validateServiceBinding(
    client: AdtRequestor,
    options: CreateServiceBindingOptions
): AsyncResult<string[], Error> {
    const bindingType: ServiceBindingType = options.bindingType ?? 'ODATA';
    const bindingVersion: ServiceBindingVersion = options.bindingVersion ?? 'V4';
    const serviceBindingVersion = bindingType === INA_BINDING_TYPE ? bindingType : `${bindingType}\\${bindingVersion}`;

    // Execute validation request (data passed via query parameters).
    const [response, requestErr] = await client.request({
        method: 'POST',
        path: '/sap/bc/adt/businessservices/bindings/validation',
        params: {
            objname: options.bindingName.toUpperCase(),
            description: options.description ?? '',
            serviceBindingVersion,
            serviceDefinition: options.serviceDefinition.toUpperCase(),
            package: options.packageName.toUpperCase(),
        },
    });

    // Validate successful response.
    const [text, checkErr] = await checkResponse(
        response,
        requestErr,
        `Failed to validate service binding ${options.bindingName}`
    );
    if (checkErr) return err(checkErr);

    return judgeSeverity(text, 'Service binding validation', options.allowWarnings ?? false);
}
