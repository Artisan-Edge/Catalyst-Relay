/**
 * IAM Delete — delete an IAM app, business catalog, role template or assignment
 */

import type { AsyncResult } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { AdtRequestor } from '../types';
import type { IamObjectKind } from './types';
import { extractError, safeParseXml } from '../../utils/xml';
import { ADTCORE_NS, KIND_LABELS, iamName, iamObjectPath, lockIamObject, unlockIamObject } from './helpers';

const USAGE_NS = 'http://www.sap.com/adt/ris/usageReferences';
const USAGE_PATH = '/sap/bc/adt/repository/informationsystem/usageReferences';
// SWB_TOOL 029 "Error while deleting object App from the database": names no cause; seen for an app still in a catalog.
const STILL_ASSIGNED_ID = 'SWB_TOOL';
const STILL_ASSIGNED_NUMBER = '029';
const CATALOG_TYPE = 'SIA1';

/**
 * Delete an IAM object: lock, DELETE, unlock.
 *
 * An IAM app still assigned to a business catalog fails with an error naming the catalogs
 * (delete its SIA7 assignments first).
 *
 * @param client - ADT client
 * @param kind - IAM object kind
 * @param name - Object name
 * @param transport - Transport request (required for packages that record changes)
 * @returns void or error
 */
export async function deleteIamObject(
    client: AdtRequestor,
    kind: IamObjectKind,
    name: string,
    transport?: string
): AsyncResult<void, Error> {
    const objectName = iamName(name);
    const label = `${KIND_LABELS[kind]} ${objectName}`;
    const [lockHandle, lockErr] = await lockIamObject(client, kind, objectName);
    if (lockErr) return err(lockErr);

    const params: Record<string, string> = { lockHandle };
    if (transport) params['corrNr'] = transport;
    const [response, requestErr] = await client.request({
        method: 'DELETE',
        path: iamObjectPath(kind, objectName),
        params,
        headers: { 'Accept': '*/*' },
    });

    // Release the lock either way; after a successful DELETE SAP may already have dropped it.
    const [, unlockErr] = await unlockIamObject(client, kind, objectName, lockHandle);
    if (requestErr) return err(requestErr);
    if (response.ok) return ok(undefined);

    const text = await response.text();
    if (kind === 'sia6' && isStillAssigned(text)) return err(await stillAssignedError(client, objectName));
    if (unlockErr) return err(new Error(`Failed to delete ${label}: ${extractError(text)} (unlock also failed: ${unlockErr.message})`));
    return err(new Error(`Failed to delete ${label}: ${extractError(text)}`));
}

/**
 * Whether an exception document carries exactly T100 message SWB_TOOL 029 (MSGID/MSGNO or T100KEY-ID/-NO).
 *
 * @param xml - exc:exception
 */
export function isStillAssigned(xml: string): boolean {
    const [doc, parseErr] = safeParseXml(xml);
    if (parseErr) return false;
    const entries = new Map<string, string>();
    const elements = doc.getElementsByTagName('entry');
    for (let i = 0; i < elements.length; i++) {
        const key = elements[i]?.getAttribute('key');
        if (key) entries.set(key, elements[i]?.textContent?.trim() ?? '');
    }
    const matches = (idKey: string, numberKey: string): boolean => entries.get(idKey) === STILL_ASSIGNED_ID && entries.get(numberKey) === STILL_ASSIGNED_NUMBER;
    return matches('T100KEY-ID', 'T100KEY-NO') || matches('MSGID', 'MSGNO');
}

// SWB_TOOL 029 names no cause; name the catalogs where-used lists (best effort).
async function stillAssignedError(client: AdtRequestor, appName: string): Promise<Error> {
    const catalogs = await assignedCatalogs(client, appName);
    const where = catalogs.length > 0 ? ` (assigned to ${catalogs.join(', ')})` : '';
    return new Error(`Cannot delete IAM app ${appName}: SAP's SWB_TOOL 029 names no cause; it is probably still assigned to a business catalog${where}. Remove the app from its business catalogs first (delete the SIA7 assignments)`);
}

async function assignedCatalogs(client: AdtRequestor, appName: string): Promise<string[]> {
    const [response, requestErr] = await client.request({
        method: 'POST',
        path: USAGE_PATH,
        params: { uri: iamObjectPath('sia6', appName), ris_request_type: 'usageReferences' },
        headers: {
            'Content-Type': 'application/vnd.sap.adt.repository.usagereferences.request.v1+xml',
            'Accept': 'application/vnd.sap.adt.repository.usagereferences.result.v1+xml',
        },
        body: `<?xml version="1.0" encoding="UTF-8"?><usagereferences:usageReferenceRequest xmlns:usagereferences="${USAGE_NS}"><usagereferences:affectedObjects/></usagereferences:usageReferenceRequest>`,
    });
    if (requestErr || !response.ok) return [];

    const [doc, parseErr] = safeParseXml(await response.text());
    if (parseErr) return [];
    const names = new Set<string>();
    const objects = doc.getElementsByTagNameNS(USAGE_NS, 'adtObject');
    for (let i = 0; i < objects.length; i++) {
        const object = objects[i];
        if (object?.getAttributeNS(ADTCORE_NS, 'type') !== CATALOG_TYPE) continue;
        const catalog = object.getAttributeNS(ADTCORE_NS, 'name');
        if (catalog) names.add(catalog);
    }
    return [...names];
}
