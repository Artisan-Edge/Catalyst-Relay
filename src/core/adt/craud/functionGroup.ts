/**
 * Function Group — make sure the container of a function module exists
 */

import type { AsyncResult } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { AdtRequestor } from '../types';
import { FUNCTION_GROUP_CONFIG } from '../types';
import { escapeXml } from '../../utils/xml';
import { checkResponse } from '../helpers';

const NOT_FOUND = 404;

/**
 * Create a function group unless it already exists
 *
 * @param client - ADT client
 * @param name - Function group name
 * @param packageName - Package for a new group
 * @param transport - Transport request (required for non-$TMP packages)
 * @param username - Responsible user for a new group
 * @returns true when the group was created, false when it already existed
 */
export async function ensureFunctionGroup(client: AdtRequestor, name: string, packageName: string, transport: string | undefined, username: string): AsyncResult<boolean, Error> {
    const config = FUNCTION_GROUP_CONFIG;
    const uri = `/sap/bc/adt/${config.endpoint}/${name.toLowerCase()}`;

    // Existing group: nothing to do.
    const [existing, existingErr] = await client.request({ method: 'GET', path: uri, headers: { 'Accept': 'application/*' } });
    if (existingErr) return err(existingErr);
    if (existing.ok) return ok(false);
    if (existing.status !== NOT_FOUND) {
        const [, checkErr] = await checkResponse(existing, null, `Failed to look up ${config.label} ${name}`);
        return err(checkErr ?? new Error(`Failed to look up ${config.label} ${name}`));
    }

    // Create the group shell.
    const body = `<?xml version="1.0" encoding="UTF-8"?>
<${config.rootName} ${config.nameSpace}
    xmlns:adtcore="http://www.sap.com/adt/core"
    adtcore:description="${escapeXml(`Function group ${name.toUpperCase()}`)}"
    adtcore:language="EN"
    adtcore:name="${escapeXml(name.toUpperCase())}"
    adtcore:type="${config.type}"
    adtcore:masterLanguage="EN"
    adtcore:responsible="${escapeXml(username.toUpperCase())}">
    <adtcore:packageRef adtcore:name="${escapeXml(packageName)}"/>
</${config.rootName}>`;

    const params: Record<string, string> = {};
    if (transport) params['corrNr'] = transport;

    const [response, requestErr] = await client.request({
        method: 'POST',
        path: `/sap/bc/adt/${config.endpoint}`,
        params,
        headers: { 'Content-Type': 'application/*' },
        body,
    });
    const [, checkErr] = await checkResponse(response, requestErr, `Failed to create ${config.label} ${name}`);
    if (checkErr) return err(checkErr);
    return ok(true);
}
