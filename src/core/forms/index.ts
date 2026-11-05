/**
 * Forms — source ↔ ADT document handlers of the form-based object types
 *
 * Pure module: no HTTP. Sits above ddic, msag and enqu (which never import it at runtime).
 */

export { getFormHandler } from './formHandler';
export type { FormHandler, FormObjectMeta, FormUpdateBody } from './types';
