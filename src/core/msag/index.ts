/**
 * Message classes — translation between .asmsag JSON and ADT documents
 *
 * Pure module: no HTTP. Used by the form-object CRAUD operations in core/adt.
 */

export type { MessageClassDef, MessageDef } from './types';
export { MAX_DESCRIPTION_LENGTH, MAX_TEXT_LENGTH } from './types';
export { parseMessageClass, normalizeNumber } from './parseMessageClass';
export { validateMessageClass } from './validateMessageClass';
export { serializeMessageClass } from './serializeMessageClass';
export { buildMessageClassXml, parseMessageClassXml, messageClassUpdateBodies } from './messageClassXml';
export type { MessageClassCreateMeta } from './messageClassXml';
export { messageClassesEquivalent } from './equivalent';
