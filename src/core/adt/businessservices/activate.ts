/**
 * Activate — activate a service binding
 */

import type { AsyncResult } from '../../../types/result';
import type { AdtRequestor } from '../types';
import type { ActivationResult } from '../craud/activation';
import { activateByReferences } from '../craud/activation';

const SERVICE_BINDING_TYPE_CODE = 'SRVB/SVB';

/**
 * Activate a service binding.
 *
 * Service bindings aren't source-file-backed, so the activation reference is built
 * here rather than resolved through the extension registry.
 *
 * @param client - ADT client
 * @param bindingName - Service binding name
 * @returns Activation results or error
 */
export async function activateServiceBinding(
    client: AdtRequestor,
    bindingName: string
): AsyncResult<ActivationResult[], Error> {
    return activateByReferences(client, [{
        uri: `/sap/bc/adt/businessservices/bindings/${bindingName.toLowerCase()}`,
        type: SERVICE_BINDING_TYPE_CODE,
        name: bindingName.toUpperCase(),
        extension: '',
    }]);
}
