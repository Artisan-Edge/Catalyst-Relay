/**
 * Refactoring helpers — internal utilities for the refactoring module
 *
 * Path/body construction and XML handling for the ADT refactorings endpoint.
 * Not exported from the adt/ barrel.
 */

import { XMLSerializer } from '@xmldom/xmldom';
import type { Result } from '../../../types/result';
import { ok, err } from '../../../types/result';
import { escapeXml, safeParseXml } from '../../utils/xml';
import type { MoveTarget } from './moveTargets';

// Refactoring endpoint and the relation selecting the change-package refactoring.
export const REFACTORINGS_PATH = '/sap/bc/adt/refactorings';
export const CHANGE_PACKAGE_REL = 'http://www.sap.com/adt/relations/refactoring/changepackage';

// Both refactoring steps exchange generic ADT media types.
export const REFACTORING_HEADERS = { 'Content-Type': 'application/*', 'Accept': 'application/*' };

const GENERIC_NS = 'http://www.sap.com/adt/refactoring/genericrefactoring';
const ELEMENT_NODE = 1;

/**
 * Build the object (root) ADT URI.
 *
 * @param config - Move target (endpoint of the object type)
 * @param name - Object name (lowercased in the URI)
 * @returns ADT URI, e.g. /sap/bc/adt/ddic/ddl/sources/zview
 */
export function buildObjectUri(config: MoveTarget, name: string): string {
    return `/sap/bc/adt/${config.endpoint}/${name.toLowerCase()}`;
}

/**
 * Build the change-package preview request body.
 *
 * @param config - Object type configuration
 * @param name - Object name
 * @param oldPackage - Package the object is currently assigned to
 * @param newPackage - Target package
 * @param transport - Transport request (empty for local packages)
 * @returns XML body for the preview step
 */
export function buildPreviewBody(config: MoveTarget, name: string, oldPackage: string, newPackage: string, transport: string): string {
    const uri = buildObjectUri(config, name);
    return `<?xml version="1.0" encoding="UTF-8"?>
<changepackage:changePackageRefactoring xmlns:adtcore="http://www.sap.com/adt/core" xmlns:generic="${GENERIC_NS}" xmlns:changepackage="http://www.sap.com/adt/refactoring/changepackagerefactoring">
    <changepackage:oldPackage>${escapeXml(oldPackage)}</changepackage:oldPackage>
    <changepackage:newPackage>${escapeXml(newPackage)}</changepackage:newPackage>
    <generic:genericRefactoring>
        <generic:title>Change Package</generic:title>
        <generic:adtObjectUri>${uri}</generic:adtObjectUri>
        <generic:affectedObjects>
            <generic:affectedObject adtcore:description="${escapeXml(config.label)}" adtcore:name="${escapeXml(name.toUpperCase())}" adtcore:packageName="${escapeXml(oldPackage)}" adtcore:type="${config.type}" adtcore:uri="${uri}">
                <generic:userContent/>
                <generic:changePackageDelta>
                    <generic:newPackage>${escapeXml(newPackage)}</generic:newPackage>
                </generic:changePackageDelta>
            </generic:affectedObject>
        </generic:affectedObjects>
        <generic:transport>${escapeXml(transport)}</generic:transport>
        <generic:ignoreSyntaxErrorsAllowed>false</generic:ignoreSyntaxErrorsAllowed>
        <generic:ignoreSyntaxErrors>false</generic:ignoreSyntaxErrors>
        <generic:userContent/>
    </generic:genericRefactoring>
    <changepackage:userContent/>
</changepackage:changePackageRefactoring>`;
}

/**
 * Build the execute request body from the server's preview response.
 *
 * The execute step takes the bare generic refactoring the preview returned,
 * so server-side state it carries (userContent) is sent back unchanged.
 *
 * @param previewXml - Preview response body
 * @param transport - Transport request (empty for local packages)
 * @returns XML body for the execute step, or error
 */
export function buildExecuteBody(previewXml: string, transport: string): Result<string, Error> {
    const [doc, parseErr] = safeParseXml(previewXml);
    if (parseErr) return err(parseErr);

    const generic = doc.getElementsByTagNameNS(GENERIC_NS, 'genericRefactoring')[0];
    if (!generic) return err(new Error('Preview response has no genericRefactoring element'));

    // Set the transport, adding the element when the server left it out.
    let transportEl = findChild(generic, 'transport');
    if (!transportEl) {
        transportEl = doc.createElementNS(GENERIC_NS, 'generic:transport');
        generic.appendChild(transportEl);
    }
    transportEl.textContent = transport;

    const xml = new XMLSerializer().serializeToString(generic);
    return ok(`<?xml version="1.0" encoding="UTF-8"?>\n${xml}`);
}

// Direct child element by local name.
function findChild(parent: Element, localName: string): Element | null {
    for (const node of Array.from(parent.childNodes)) {
        if (node.nodeType !== ELEMENT_NODE) continue;
        const el = node as Element;
        if (el.localName === localName) return el;
    }
    return null;
}
