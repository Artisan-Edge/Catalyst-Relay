/**
 * CRAUD methods barrel exports
 */

export { read } from './read';
export { create } from './create';
export { update } from './update';
export { readClassInclude, writeClassInclude } from './specialcases/classes';
export { upsert, upsertSingle } from './upsert';
export { activate } from './activate';
export { deleteObjects } from './delete';
export { checkSyntax } from './checkSyntax';
