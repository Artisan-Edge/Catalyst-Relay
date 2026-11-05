/**
 * Resolve Containers — fill in the function group of function modules and includes addressed by name only
 */

import type { AsyncResult } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { ObjectRef } from '../../../types/requests';
import type { AdtRequestor } from '../types';
import { getConfigByExtension } from '../types';
import { searchObjects } from '../discovery/searchObjects';
import { mapLimited } from '../../utils/concurrency';
import { containerFromIncludeName, isFunctionGroupInclude } from '../functionGroup/names';

/**
 * Return copies of the objects with `container` set where the type needs one
 *
 * Objects that already carry a container, or whose type has none, pass through.
 *
 * @param client - ADT client
 * @param objects - Object references (or contents)
 * @returns Objects with containers, or an error naming an object that can't be found
 */
export async function resolveContainers<T extends ObjectRef>(client: AdtRequestor, objects: T[]): AsyncResult<T[], Error> {
    return mapLimited(objects, async (object): AsyncResult<T, Error> => {
        const config = getConfigByExtension(object.extension);
        if (!config?.container || object.container) return ok(object);

        // Function group includes are named L<group>xxx; search only for names that don't fit.
        const fromName = isFunctionGroupInclude(object) ? containerFromIncludeName(object.name) : null;
        if (fromName) return ok({ ...object, container: fromName });

        // Quick search returns …/functions/groups/{group}/fmodules/{name}.
        const [results, searchErr] = await searchObjects(client, object.name, { types: [config.type], includePackages: false });
        if (searchErr) return err(new Error(`Failed to find the ${config.container.label} of ${object.name}: ${searchErr.message}`));
        const match = results.find(r => r.name.toUpperCase() === object.name.toUpperCase() && r.container);
        if (!match?.container) return err(new Error(`${config.label} ${object.name} not found; pass its ${config.container.label} as the container`));

        return ok({ ...object, container: match.container });
    });
}
