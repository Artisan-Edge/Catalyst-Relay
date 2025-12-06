/**
 * Objects routes barrel export
 */

export { readHandler, readRequestSchema, type ReadResponse } from './read';
export { upsertHandler, upsertRequestSchema, type UpsertResponse } from './upsert';
export { activateHandler, activateRequestSchema, type ActivateResponse } from './activate';
export { deleteHandler, deleteRequestSchema, type DeleteResponse } from './delete';
