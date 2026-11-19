// Parse an ATC worklist (application/atc.worklist.v1+xml) into objects with their findings

import type { Result } from '../../../types/result';
import { ok, err } from '../../../types/result';
import { safeParseXml } from '../../utils/xml';
import { ADTCORE_NS, childElements, firstChildElement } from '../../utils/xmlDom';
import type { AtcFinding, AtcFindingLocation, AtcObject, AtcSummary } from './types';

const OBJECT_NS = 'http://www.sap.com/adt/atc/object';
const FINDING_NS = 'http://www.sap.com/adt/atc/finding';
const ALLOW_TRANSPORTS = 'allowTransports';
const POSITION = /#start=(\d+)(?:,(\d+))?$/;
const PRIORITY_ERROR = 1;
const PRIORITY_WARNING = 2;
const PRIORITY_INFO = 3;

export function parseAtcWorklist(xml: string): Result<AtcObject[], Error> {
    const [doc, parseErr] = safeParseXml(xml);
    if (parseErr) return err(parseErr);

    const root = doc.documentElement;
    if (!root || root.localName !== 'worklist') return err(new Error(`Unexpected ATC worklist response: <${root?.nodeName ?? 'empty'}>`));

    return ok(childElements(firstChildElement(root, 'objects'), 'object', OBJECT_NS).map(parseObject));
}

export function summarizeAtc(objects: readonly AtcObject[]): AtcSummary {
    const findings = objects.flatMap(object => object.findings);
    const blocking = findings.filter(finding => finding.blocksTransport).length;
    return {
        objects: objects.length,
        findings: findings.length,
        errors: findings.filter(finding => finding.priority === PRIORITY_ERROR).length,
        warnings: findings.filter(finding => finding.priority === PRIORITY_WARNING).length,
        infos: findings.filter(finding => finding.priority >= PRIORITY_INFO).length,
        blocking,
        releasable: blocking === 0,
    };
}

function parseObject(element: Element): AtcObject {
    const findings = childElements(firstChildElement(element, 'findings', OBJECT_NS), 'finding', FINDING_NS).map(parseFinding);
    return {
        type: element.getAttributeNS(ADTCORE_NS, 'type') ?? '',
        name: element.getAttributeNS(ADTCORE_NS, 'name') ?? '',
        packageName: element.getAttributeNS(ADTCORE_NS, 'packageName') ?? '',
        author: element.getAttributeNS(OBJECT_NS, 'author') ?? '',
        findings,
    };
}

function parseFinding(element: Element): AtcFinding {
    const attr = (name: string): string => element.getAttributeNS(FINDING_NS, name) ?? '';
    const effectOnTransports = attr('effectOnTransports');
    const tags = parseTags(element);
    return {
        uri: element.getAttributeNS(ADTCORE_NS, 'uri') ?? '',
        location: parseLocation(attr('location')),
        priority: Number(attr('priority')),
        checkId: attr('checkId'),
        checkTitle: attr('checkTitle'),
        messageId: attr('messageId'),
        messageTitle: attr('messageTitle'),
        effectOnTransports,
        blocksTransport: effectOnTransports !== '' && effectOnTransports !== ALLOW_TRANSPORTS,
        exemptionKind: attr('exemptionKind'),
        exemptionApproval: attr('exemptionApproval'),
        processor: attr('processor'),
        ...(tags ? { tags } : {}),
    };
}

// "/sap/bc/adt/oo/classes/zcl_foo/source/main#start=1763,0"
function parseLocation(location: string): AtcFindingLocation {
    const match = POSITION.exec(location);
    if (!match) return { uri: location };

    const uri = location.substring(0, match.index);
    const column = match[2] === undefined ? undefined : Number(match[2]);
    return { uri, line: Number(match[1]), ...(column === undefined ? {} : { column }) };
}

function parseTags(element: Element): Record<string, string> | null {
    const tags = childElements(firstChildElement(element, 'tags', FINDING_NS), 'tag', FINDING_NS);
    if (tags.length === 0) return null;

    const result: Record<string, string> = {};
    for (const tag of tags) {
        const name = tag.getAttributeNS(FINDING_NS, 'name');
        if (!name) continue;
        result[name] = tag.getAttributeNS(FINDING_NS, 'value') ?? '';
    }
    return result;
}
