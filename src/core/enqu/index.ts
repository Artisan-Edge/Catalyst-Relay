/**
 * Lock objects — translation between .asenqu DSL and ADT documents
 *
 * Pure module: no HTTP. Used by the form-object CRAUD operations in core/adt.
 */

export type { LockObjectDef, LockTableDef, LockParameterDef, LockMode } from './types';
export { LOCK_MODES, MAX_NAME_LENGTH as MAX_LOCK_OBJECT_NAME_LENGTH } from './types';
export { parseLockObject } from './parseLockObject';
export { serializeLockObject } from './serializeLockObject';
export { validateLockObject } from './validateLockObject';
export { buildLockObjectXml, parseLockObjectXml, mergeLockObjectXml } from './lockObjectXml';
export type { LockObjectCreateMeta } from './lockObjectXml';
export { lockObjectsEquivalent } from './equivalent';
