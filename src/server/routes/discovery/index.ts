/**
 * Discovery routes barrel export
 */

export { packagesHandler, type PackagesResponse } from './packages';
export { treeHandler } from './tree';
export type { TreeResponse } from '../../../core/adt';
export { transportsHandler, type TransportsResponse } from './transports';
export { createTransportHandler, type CreateTransportResponse } from './createTransport';
export { objectConfigHandler, type ObjectConfigResponse } from './objectConfig';
