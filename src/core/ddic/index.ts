/**
 * DDIC — translation between .asdtel/.asdoma sources and ADT documents
 *
 * Pure module: no HTTP. Used by the form-object CRAUD operations in core/adt.
 */

export type { AbapType, DataElementDef, DataElementLabels, DomainDef, FixedValue, DdicObjectMeta } from './types';
export { DdicParseError } from './types';
export { SUPPORTED_ABAP_TYPES, formatAbapType } from './abapTypes';
export { parseDataElement } from './parseDataElement';
export { parseDomain } from './parseDomain';
export { serializeDataElement } from './serializeDataElement';
export { serializeDomain } from './serializeDomain';
export { buildDataElementXml, parseDataElementXml, mergeDataElementXml } from './dataElementXml';
export { buildDomainXml, parseDomainXml, mergeDomainXml } from './domainXml';
export { validateDataElement, validateDomain } from './validate';
export { dataElementsEquivalent, domainsEquivalent } from './equivalent';
export { getFormHandler } from './formHandler';
export type { FormHandler } from './formHandler';
