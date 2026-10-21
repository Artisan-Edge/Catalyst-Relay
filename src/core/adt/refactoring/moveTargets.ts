/**
 * Move targets — object types the change-package refactoring can address
 *
 * The configured object types (OBJECT_CONFIG_MAP) come first. A few more types
 * can be moved but nothing else in this library can read, write, activate or
 * delete them, so they live here instead of in OBJECT_CONFIG_MAP: that map is
 * what gates every other operation.
 */

import type { Result } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { ObjectConfig } from '../types';
import { getConfigByExtension } from '../types';

/**
 * What the change-package refactoring needs to address an object.
 */
export type MoveTarget = Pick<ObjectConfig, 'endpoint' | 'type' | 'label'>;

// Endpoints and ADT types as reported by the virtual-folder tree.
const MOVE_ONLY_TARGETS: Record<string, MoveTarget> = {
    dtel: { endpoint: 'ddic/dataelements', type: 'DTEL/DE', label: 'Data Element' },
    doma: { endpoint: 'ddic/domains', type: 'DOMA/DD', label: 'Domain' },
    fugr: { endpoint: 'functions/groups', type: 'FUGR/F', label: 'Function Group' },
    srvb: { endpoint: 'businessservices/bindings', type: 'SRVB/SVB', label: 'Service Binding' },
};

/**
 * Extensions accepted only by changePackage.
 */
export const MOVE_ONLY_EXTENSIONS = Object.keys(MOVE_ONLY_TARGETS);

/**
 * Resolve an extension to a move target.
 *
 * @param extension - Configured extension (e.g. 'asddls') or move-only one (e.g. 'dtel')
 * @returns Move target or error for an unknown extension
 */
export function resolveMoveTarget(extension: string): Result<MoveTarget, Error> {
    const config = getConfigByExtension(extension) ?? MOVE_ONLY_TARGETS[extension];
    if (!config) return err(new Error(`Unsupported extension: ${extension}`));
    return ok(config);
}
