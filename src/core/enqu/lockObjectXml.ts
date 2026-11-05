/**
 * Lock Object XML — LockObjectDef ↔ ADT document (application/vnd.sap.adt.lockobjects.v1+xml)
 *
 * The create POST takes the full document; an update PUTs it back under a lock. A PUT
 * without <enqu:lockParameters> marks every key field not wanted, so the parameters are
 * always sent in full. <enqu:lockModules> (ENQUEUE_/DEQUEUE_) is read-only and dropped.
 */

import type { Result } from '../../types/result';
import { ok, err } from '../../types/result';
import { escapeXml, safeParseXml } from '../utils/xml';
import { ADTCORE_NS, childElements, serializeXml } from '../utils/xmlDom';
import { LOCK_MODES } from './types';
import type { LockMode, LockObjectDef, LockParameterDef, LockTableDef } from './types';

const ENQU_NS = 'http://www.sap.com/adt/ddic/enqu';
const TYPE = 'ENQU/DL';

export interface LockObjectCreateMeta {
    name: string;
    packageName: string;
    responsible: string;
}

/**
 * Build the create document
 *
 * @param def - Definition
 * @param meta - Package and responsible user
 * @returns XML body for POST /sap/bc/adt/ddic/lockobjects/sources
 */
export function buildLockObjectXml(def: LockObjectDef, meta: LockObjectCreateMeta): Result<string, Error> {
    return ok(`<?xml version="1.0" encoding="UTF-8"?><enqu:lockobject xmlns:enqu="${ENQU_NS}" xmlns:adtcore="${ADTCORE_NS}" adtcore:description="${escapeXml(def.description)}" adtcore:language="EN" adtcore:name="${escapeXml(def.name.toUpperCase())}" adtcore:type="${TYPE}" adtcore:masterLanguage="EN" adtcore:responsible="${escapeXml(meta.responsible.toUpperCase())}"><adtcore:packageRef adtcore:name="${escapeXml(meta.packageName)}"/>${contentXml(def)}</enqu:lockobject>`);
}

/**
 * Read a lock object from an ADT document
 *
 * @param xml - GET response body
 * @returns Definition or error
 */
export function parseLockObjectXml(xml: string): Result<LockObjectDef, Error> {
    const [doc, parseErr] = safeParseXml(xml);
    if (parseErr) return err(parseErr);
    const root = doc.documentElement;
    if (!root || root.localName !== 'lockobject') return err(new Error('Not a lock object document'));
    const content = child(root, 'content');
    if (!content) return err(new Error('Missing <enqu:content> in lock object document'));

    const primaryElement = child(content, 'primaryTable');
    if (!primaryElement) return err(new Error('Missing <enqu:primaryTable> in lock object document'));
    const [primary, primaryErr] = toTable(primaryElement);
    if (primaryErr) return err(primaryErr);

    const secondary: LockTableDef[] = [];
    for (const element of children(child(content, 'secondaryTables'), 'secondaryTable')) {
        const [table, tableErr] = toTable(element);
        if (tableErr) return err(tableErr);
        secondary.push(table);
    }
    const parameters = children(child(content, 'lockParameters'), 'lockParameter').map(toParameter);

    return ok({
        name: root.getAttributeNS(ADTCORE_NS, 'name') ?? '',
        description: root.getAttributeNS(ADTCORE_NS, 'description') ?? '',
        allowRfc: text(content, 'allowRFC') === 'true',
        primary,
        secondary,
        parameters,
    });
}

/**
 * Apply the definition onto the server's document: description and the whole content
 *
 * @param xml - Current document (GET body)
 * @param def - Definition to apply
 * @returns PUT body or error
 */
export function mergeLockObjectXml(xml: string, def: LockObjectDef): Result<string, Error> {
    const [doc, parseErr] = safeParseXml(xml);
    if (parseErr) return err(parseErr);
    const root = doc.documentElement;
    if (!root || root.localName !== 'lockobject') return err(new Error('Not a lock object document'));

    root.setAttributeNS(ADTCORE_NS, 'adtcore:description', def.description);
    const existing = child(root, 'content');
    if (existing) root.removeChild(existing);

    // Parse the new content in a wrapper declaring the namespace, then import it.
    const [contentDoc, contentErr] = safeParseXml(`<w xmlns:enqu="${ENQU_NS}">${contentXml(def)}</w>`);
    if (contentErr) return err(contentErr);
    const content = child(contentDoc.documentElement!, 'content');
    if (!content) return err(new Error('Failed to build lock object content'));
    root.appendChild(doc.importNode(content, true));
    return ok(serializeXml(doc));
}

function contentXml(def: LockObjectDef): string {
    const table = (tag: string, t: LockTableDef) => `<enqu:${tag}><enqu:tableName>${escapeXml(t.table.toUpperCase())}</enqu:tableName><enqu:lockMode>${t.lockMode}</enqu:lockMode></enqu:${tag}>`;
    const secondary = def.secondary.length > 0 ? `<enqu:secondaryTables>${def.secondary.map(t => table('secondaryTable', t)).join('')}</enqu:secondaryTables>` : '<enqu:secondaryTables/>';
    const parameters = def.parameters.map(p => `<enqu:lockParameter><enqu:parameterWanted>${p.wanted}</enqu:parameterWanted><enqu:parameterName>${escapeXml(p.name.toUpperCase())}</enqu:parameterName><enqu:tableName>${escapeXml(p.table.toUpperCase())}</enqu:tableName><enqu:fieldName>${escapeXml(p.field.toUpperCase())}</enqu:fieldName></enqu:lockParameter>`).join('');
    return `<enqu:content><enqu:allowRFC>${def.allowRfc}</enqu:allowRFC>${table('primaryTable', def.primary)}${secondary}<enqu:lockParameters>${parameters}</enqu:lockParameters></enqu:content>`;
}

function children(parent: Element | null, localName: string): Element[] {
    return childElements(parent, localName, ENQU_NS);
}

function child(parent: Element, localName: string): Element | null {
    return children(parent, localName)[0] ?? null;
}

function text(parent: Element, localName: string): string {
    return child(parent, localName)?.textContent?.trim() ?? '';
}

// A mode this module does not know is an error, not a silent 'E' (writing it back would change the lock)
function toTable(element: Element): Result<LockTableDef, Error> {
    const table = text(element, 'tableName');
    const mode = text(element, 'lockMode').toUpperCase();
    if (!isLockMode(mode)) return err(new Error(`Table ${table} has lock mode '${mode}', which is not supported (supported: ${LOCK_MODES.join(', ')})`));
    return ok({ table, lockMode: mode });
}

function isLockMode(mode: string): mode is LockMode {
    return (LOCK_MODES as readonly string[]).includes(mode);
}

function toParameter(element: Element): LockParameterDef {
    return {
        name: text(element, 'parameterName'),
        table: text(element, 'tableName'),
        field: text(element, 'fieldName'),
        wanted: text(element, 'parameterWanted') === 'true',
    };
}
