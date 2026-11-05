/**
 * Edit Metadata — apply attributes to a metadata document through the DOM
 *
 * Namespaces are matched by URI, so another prefix or a self-closing root works the same;
 * a document without the expected root or attribute is an error, never a silent no-op.
 */

import type { Result } from '../../../types/result';
import { ok, err } from '../../../types/result';
import { safeParseXml } from '../../utils/xml';
import { ADTCORE_NS, childElements, serializeXml } from '../../utils/xmlDom';
import { PROGRAM_NS } from './types';
import type { MetadataEdit, ObjectAttributes, ObjectAttributesInfo } from './types';

const DEFAULT_ADTCORE_PREFIX = 'adtcore';
const DEFAULT_PROGRAM_PREFIX = 'program';
const AUTH_GROUP = 'authorizationGroup';

/**
 * @param xml - Metadata document (GET body)
 * @param current - Attributes parsed from it
 * @param attributes - Attributes to set; omitted ones are left alone
 * @returns The edited document and the attributes that changed (none: the input document)
 */
export function editMetadata(xml: string, current: ObjectAttributesInfo, attributes: ObjectAttributes): Result<MetadataEdit, Error> {
    const changed: (keyof ObjectAttributes)[] = [];
    const title = attributes.title;
    const titleChanges = title !== undefined && title !== current.title;
    const group = attributes.authorizationGroup?.toUpperCase();
    const groupChanges = group !== undefined && group !== (current.authorizationGroup ?? '');
    if (!titleChanges && !groupChanges) return ok({ xml, changed });

    const [doc, parseErr] = safeParseXml(xml);
    if (parseErr) return err(parseErr);
    const root = doc.documentElement;
    if (!root) return err(new Error(`${current.name}: empty metadata document`));

    if (titleChanges) {
        if (!title.trim()) return err(new Error(`${current.name}: the title cannot be empty`));
        if (current.titleMaxLength && title.length > current.titleMaxLength) {
            return err(new Error(`${current.name}: title is ${title.length} characters; SAP allows ${current.titleMaxLength}`));
        }
        if (!root.hasAttributeNS(ADTCORE_NS, 'description')) return err(new Error(`${current.name}: no description in the metadata document`));
        const prefix = root.lookupPrefix(ADTCORE_NS) ?? DEFAULT_ADTCORE_PREFIX;
        root.setAttributeNS(ADTCORE_NS, `${prefix}:description`, title);
        changed.push('title');
    }

    if (groupChanges) {
        if (root.namespaceURI !== PROGRAM_NS) return err(new Error(`${current.name}: not a program metadata document`));
        for (const element of childElements(root, AUTH_GROUP, PROGRAM_NS)) root.removeChild(element);
        if (group) root.appendChild(authorizationGroupElement(doc, root, group));
        changed.push('authorizationGroup');
    }

    return ok({ xml: serializeXml(doc), changed });
}

// <program:authorizationGroup><program:ref adtcore:name="GROUP"/></program:authorizationGroup>
function authorizationGroupElement(doc: Document, root: Element, group: string): Element {
    const programPrefix = root.prefix ?? DEFAULT_PROGRAM_PREFIX;
    const adtcorePrefix = root.lookupPrefix(ADTCORE_NS) ?? DEFAULT_ADTCORE_PREFIX;
    const element = doc.createElementNS(PROGRAM_NS, `${programPrefix}:${AUTH_GROUP}`);
    const ref = doc.createElementNS(PROGRAM_NS, `${programPrefix}:ref`);
    ref.setAttributeNS(ADTCORE_NS, `${adtcorePrefix}:name`, group);
    element.appendChild(ref);
    return element;
}
