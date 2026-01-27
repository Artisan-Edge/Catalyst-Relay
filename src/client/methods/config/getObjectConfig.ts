/**
 * Get object configuration method
 */

import type { ObjectConfig } from '../../../core/adt';
import * as adt from '../../../core/adt';

export function getObjectConfig(): ObjectConfig[] {
    return Object.values(adt.OBJECT_CONFIG_MAP);
}
