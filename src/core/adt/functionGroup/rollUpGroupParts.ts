/**
 * Roll Up Group Parts — delete results of the parts deleted with their function group
 */

import type { ObjectRef } from '../../../types/requests';
import type { DeleteResult } from '../craud/multiDelete';
import { isFunctionGroup } from './names';

/**
 * One result per part, following its group's: success when the group was deleted, not_found
 * when it does not exist, otherwise an error carrying the group's message
 *
 * @param parts - Parts split off by splitGroupParts
 * @param results - Results of the direct deletes (the groups among them)
 */
export function rollUpGroupParts(parts: readonly ObjectRef[], results: readonly DeleteResult[]): DeleteResult[] {
    return parts.map((part): DeleteResult => {
        const group = part.container!.toUpperCase();
        const groupResult = results.find(r => isFunctionGroup(r) && r.name.toUpperCase() === group);
        if (groupResult?.status === 'success') {
            return { name: part.name, extension: part.extension, status: 'success', message: `Deleted with function group ${group}` };
        }
        if (groupResult?.status === 'not_found') {
            return { name: part.name, extension: part.extension, status: 'not_found', message: groupResult.message ?? `Function group ${group} does not exist` };
        }
        const reason = groupResult?.message ?? 'it was not deleted';
        return { name: part.name, extension: part.extension, status: 'error', message: `Not deleted: function group ${group} failed: ${reason}` };
    });
}
