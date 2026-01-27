/**
 * Get object configuration method
 */

import type { ObjectConfig } from '../../../adt';
import * as adt from '../../../adt';

export function getObjectConfig(): ObjectConfig[] {
    return Object.values(adt.OBJECT_CONFIG_MAP);
}
