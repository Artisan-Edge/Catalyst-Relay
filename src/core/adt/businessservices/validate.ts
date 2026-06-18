/**
 * Validate — pre-flight check for a service binding
 */

import type { AsyncResult } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { AdtRequestor } from '../types';
import type { CreateServiceBindingOptions, ServiceBindingType, ServiceBindingVersion } from './types';
import { extractTagText } from '../../utils/xml';
import { checkResponse } from '../helpers';

const SEVERITY_OK = 'OK';

/**
 * Validate a service binding before creating it.
 *
 * Returns an error when the server reports a non-OK severity.
 *
 * @param client - ADT client
 * @param options - Service binding options
 * @returns void or error
 */
export async function validateServiceBinding(
    client: AdtRequestor,
    options: CreateServiceBindingOptions
): AsyncResult<void, Error> {
    const bindingType: ServiceBindingType = options.bindingType ?? 'ODATA';
    const bindingVersion: ServiceBindingVersion = options.bindingVersion ?? 'V4';

    // Execute validation request (data passed via query parameters).
    const [response, requestErr] = await client.request({
        method: 'POST',
        path: '/sap/bc/adt/businessservices/bindings/validation',
        params: {
            objname: options.bindingName.toUpperCase(),
            description: options.description ?? '',
            serviceBindingVersion: `${bindingType}\\${bindingVersion}`,
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

    // Surface non-OK severities as errors.
    const severity = extractTagText(text, 'SEVERITY');
    if (severity && severity !== SEVERITY_OK) {
        const shortText = extractTagText(text, 'SHORT_TEXT') ?? '';
        return err(new Error(`Service binding validation failed (${severity}): ${shortText}`));
    }

    return ok(undefined);
}
