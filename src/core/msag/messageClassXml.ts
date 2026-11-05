/**
 * Message Class XML — MessageClassDef ↔ ADT document (application/vnd.sap.adt.mc.messageclass+xml)
 *
 * SAP's PUT handler (CL_ADT_MC_RES_CONTROLLER->do_update) merges rather than replaces:
 * - <mc:messages> not yet in the class are created; others are updated only when their
 *   text changed or they carry mc:lockhandle (which also applies a self-explanatory change)
 * - messages left out are kept; <mc:deletedmessages mc:msgno=".."/> deletes one
 * - a PUT that creates messages skips self-explanatory changes on the updated ones,
 *   so creates go in a second PUT
 * The create POST ignores messages, so a new class is filled by a PUT afterwards.
 */

import type { Result } from '../../types/result';
import { ok, err } from '../../types/result';
import { escapeXml, safeParseXml } from '../utils/xml';
import { ADTCORE_NS, childElements, serializeXml } from '../utils/xmlDom';
import type { FormUpdateBody } from '../forms/types';
import type { MessageClassDef, MessageDef } from './types';
import { sortMessages } from './parseMessageClass';

const MC_NS = 'http://www.sap.com/adt/MessageClass';
const MESSAGE_ELEMENT = 'messages';
const DELETED_ELEMENT = 'deletedmessages';
const TYPE = 'MSAG/N';
const UPDATE_LABEL = 'description, changed and deleted messages';
const CREATE_LABEL = 'new messages';

export interface MessageClassCreateMeta {
    name: string;
    packageName: string;
    responsible: string;
}

/**
 * Build the create document (description and package only; SAP ignores messages here)
 *
 * @param def - Definition
 * @param meta - Class name, package and responsible user
 * @returns XML body for POST /sap/bc/adt/messageclass
 */
export function buildMessageClassXml(def: MessageClassDef, meta: MessageClassCreateMeta): Result<string, Error> {
    if (!def.description.trim()) return err(new Error('description is required to create a message class'));
    return ok(`<?xml version="1.0" encoding="UTF-8"?>
<mc:messageClass xmlns:mc="${MC_NS}" xmlns:adtcore="${ADTCORE_NS}" adtcore:description="${escapeXml(def.description)}" adtcore:language="EN" adtcore:masterLanguage="EN" adtcore:name="${escapeXml(meta.name.toUpperCase())}" adtcore:type="${TYPE}" adtcore:responsible="${escapeXml(meta.responsible.toUpperCase())}">
  <adtcore:packageRef adtcore:name="${escapeXml(meta.packageName)}"/>
</mc:messageClass>`);
}

/**
 * Read a message class from an ADT document
 *
 * @param xml - GET response body
 * @returns Definition or error
 */
export function parseMessageClassXml(xml: string): Result<MessageClassDef, Error> {
    const [doc, parseErr] = safeParseXml(xml);
    if (parseErr) return err(parseErr);
    const root = doc.documentElement;
    if (!root || root.localName !== 'messageClass') return err(new Error('Not a message class document'));

    const messages = messageElements(root, MESSAGE_ELEMENT).map(toMessage);
    return ok({ description: root.getAttributeNS(ADTCORE_NS, 'description') ?? '', messages: sortMessages(messages) });
}

/**
 * PUT bodies that turn the server's class into the definition (empty when nothing changes)
 *
 * The first body changes the description, updates and deletes messages; the second
 * creates new ones. Messages missing from the definition are deleted. An empty description
 * is accepted only when the server's is empty too (it cannot be cleared).
 *
 * @param xml - Current document (GET body)
 * @param def - Definition to apply
 * @param lockHandle - Class lock handle, sent on updated messages to force the update
 * @returns Ordered, labelled PUT bodies or error
 */
export function messageClassUpdateBodies(xml: string, def: MessageClassDef, lockHandle: string): Result<FormUpdateBody[], Error> {
    const [doc, parseErr] = safeParseXml(xml);
    if (parseErr) return err(parseErr);
    const root = doc.documentElement;
    if (!root || root.localName !== 'messageClass') return err(new Error('Not a message class document'));

    // Current state, with each message's documented flag (passed back on update).
    const current = new Map<string, { message: MessageDef; documented: string }>();
    for (const element of messageElements(root, MESSAGE_ELEMENT)) {
        const message = toMessage(element);
        current.set(message.number, { message, documented: element.getAttributeNS(MC_NS, 'documented') ?? '' });
    }
    const wanted = new Set(def.messages.map(message => message.number));

    // Split into creates, updates and deletes.
    const creates = def.messages.filter(message => !current.has(message.number));
    const updates = def.messages.filter(message => {
        const existing = current.get(message.number)?.message;
        return existing !== undefined && (existing.text !== message.text || existing.selfExplanatory !== message.selfExplanatory);
    });
    const deletes = [...current.keys()].filter(number => !wanted.has(number)).sort();
    const serverDescription = root.getAttributeNS(ADTCORE_NS, 'description') ?? '';
    if (!def.description.trim() && serverDescription.trim()) return err(new Error(`description is required (the class has '${serverDescription}'); it cannot be cleared`));
    const descriptionChanged = serverDescription !== def.description;

    // Strip the server's messages; the root and package reference are reused as is.
    for (const element of [...messageElements(root, MESSAGE_ELEMENT), ...messageElements(root, DELETED_ELEMENT)]) {
        root.removeChild(element);
    }
    if (def.description || root.hasAttributeNS(ADTCORE_NS, 'description')) root.setAttributeNS(ADTCORE_NS, 'adtcore:description', def.description);

    const bodies: FormUpdateBody[] = [];
    if (descriptionChanged || updates.length > 0 || deletes.length > 0) {
        const children = [
            ...updates.map(message => messageElement(doc, message, { lockhandle: lockHandle, documented: current.get(message.number)?.documented ?? '' })),
            ...deletes.map(number => deletedElement(doc, number)),
        ];
        bodies.push({ label: UPDATE_LABEL, body: withChildren(doc, root, children) });
    }
    if (creates.length > 0) {
        bodies.push({ label: `${CREATE_LABEL} ${creates.map(message => message.number).join(', ')}`, body: withChildren(doc, root, creates.map(message => messageElement(doc, message, {}))) });
    }
    return ok(bodies);
}

function messageElements(root: Element, localName: string): Element[] {
    return childElements(root, localName, MC_NS);
}

function toMessage(element: Element): MessageDef {
    return {
        number: element.getAttributeNS(MC_NS, 'msgno') ?? '',
        text: element.getAttributeNS(MC_NS, 'msgtext') ?? '',
        selfExplanatory: element.getAttributeNS(MC_NS, 'selfexplainatory') === 'true',
    };
}

function messageElement(doc: Document, message: MessageDef, extra: Record<string, string>): Element {
    const element = doc.createElementNS(MC_NS, `mc:${MESSAGE_ELEMENT}`);
    element.setAttributeNS(MC_NS, 'mc:msgno', message.number);
    element.setAttributeNS(MC_NS, 'mc:msgtext', message.text);
    element.setAttributeNS(MC_NS, 'mc:selfexplainatory', String(message.selfExplanatory));
    for (const [name, value] of Object.entries(extra)) {
        if (value) element.setAttributeNS(MC_NS, `mc:${name}`, value);
    }
    return element;
}

function deletedElement(doc: Document, number: string): Element {
    const element = doc.createElementNS(MC_NS, `mc:${DELETED_ELEMENT}`);
    element.setAttributeNS(MC_NS, 'mc:msgno', number);
    return element;
}

// Serialize the root with the given message children, then take them out again.
function withChildren(doc: Document, root: Element, children: Element[]): string {
    for (const child of children) root.appendChild(child);
    const xml = serializeXml(doc);
    for (const child of children) root.removeChild(child);
    return xml;
}
