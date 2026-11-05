/**
 * Parse Object Attributes — title, title limit and program facts from a metadata document
 */

import type { Result } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { ObjectRef } from '../../../types/requests';
import { safeParseXml } from '../../utils/xml';
import { ADTCORE_NS } from '../../utils/xmlDom';
import { PROGRAM_EXTENSION, PROGRAM_NS } from './types';
import type { ObjectAttributesInfo } from './types';

export function parseObjectAttributes(xml: string, object: ObjectRef): Result<ObjectAttributesInfo, Error> {
    const [doc, parseErr] = safeParseXml(xml);
    if (parseErr) return err(parseErr);
    const root = doc.documentElement;
    if (!root) return err(new Error(`${object.name}: empty metadata document`));

    const info: ObjectAttributesInfo = { name: object.name, extension: object.extension, title: root.getAttributeNS(ADTCORE_NS, 'description') ?? '' };
    const limit = Number(root.getAttributeNS(ADTCORE_NS, 'descriptionTextLimit'));
    if (limit > 0) info.titleMaxLength = limit;
    if (object.extension !== PROGRAM_EXTENSION) return ok(info);

    const programType = root.getAttributeNS(PROGRAM_NS, 'programType');
    if (programType) info.programType = programType;
    const group = root.getElementsByTagNameNS(PROGRAM_NS, 'authorizationGroup')[0];
    const ref = group?.getElementsByTagNameNS(PROGRAM_NS, 'ref')[0];
    info.authorizationGroup = ref?.getAttributeNS(ADTCORE_NS, 'name') ?? '';
    return ok(info);
}
