/**
 * Function Group Parts — list a function group's own includes and function modules
 */

import type { AsyncResult, Result } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { AdtRequestor } from '../types';
import { FUNCTION_GROUP_CONFIG } from '../types';
import { FUNCTION_GROUP_INCLUDE, FUNCTION_MODULE, containerFromUri } from '../functionGroup/names';
import { extractError, safeParseXml } from '../../utils/xml';

const INCLUDE_TYPE = FUNCTION_GROUP_INCLUDE.type;
const FUNCTION_MODULE_TYPE = FUNCTION_MODULE.type;

export interface FunctionGroupPart {
    name: string;
    /** asfinc (include) or asfunc (function module) */
    extension: 'asfinc' | 'asfunc';
    uri: string;
    description?: string;
}

export interface FunctionGroupParts {
    group: string;
    includes: FunctionGroupPart[];
    functionModules: FunctionGroupPart[];
}

/**
 * List the includes and function modules of a function group
 *
 * The repository tree also lists includes the group shares with others (e.g. LSVIM*
 * of maintenance groups, under /functions/groups/svim/); only the group's own are kept.
 *
 * @param client - ADT client
 * @param group - Function group name
 * @returns The group's own includes and function modules, or error
 */
export async function getFunctionGroupParts(client: AdtRequestor, group: string): AsyncResult<FunctionGroupParts, Error> {
    const name = group.toUpperCase();
    const [response, requestErr] = await client.request({
        method: 'POST',
        path: '/sap/bc/adt/repository/nodestructure',
        params: { parent_type: FUNCTION_GROUP_CONFIG.type, parent_name: name, withShortDescriptions: 'true' },
        headers: { 'Accept': 'application/vnd.sap.as+xml' },
    });
    if (requestErr) return err(requestErr);

    const text = await response.text();
    if (!response.ok) return err(new Error(`Failed to list ${FUNCTION_GROUP_CONFIG.label} ${name}: ${extractError(text)}`));
    // An unknown group answers 200 with an empty body
    if (!text.trim()) return err(new Error(`${FUNCTION_GROUP_CONFIG.label} ${name} not found`));
    return parseFunctionGroupParts(name, text);
}

/**
 * Parse a nodestructure response into the group's own parts (exported for tests)
 */
export function parseFunctionGroupParts(group: string, xml: string): Result<FunctionGroupParts, Error> {
    const [doc, parseErr] = safeParseXml(xml);
    if (parseErr) return err(parseErr);

    const parts: FunctionGroupParts = { group, includes: [], functionModules: [] };
    const nodes = doc.getElementsByTagName('SEU_ADT_REPOSITORY_OBJ_NODE');
    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i]!;
        const type = childText(node, 'OBJECT_TYPE');
        if (type !== INCLUDE_TYPE && type !== FUNCTION_MODULE_TYPE) continue;

        const uri = childText(node, 'OBJECT_URI');
        if (containerFromUri(uri) !== group) continue;

        const part: FunctionGroupPart = {
            name: childText(node, 'OBJECT_NAME'),
            extension: type === INCLUDE_TYPE ? 'asfinc' : 'asfunc',
            uri,
        };
        const description = childText(node, 'DESCRIPTION');
        if (description) part.description = description;
        (type === INCLUDE_TYPE ? parts.includes : parts.functionModules).push(part);
    }
    return ok(parts);
}

function childText(node: Element, tag: string): string {
    return node.getElementsByTagName(tag)[0]?.textContent?.trim() ?? '';
}
