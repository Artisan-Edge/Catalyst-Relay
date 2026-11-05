/**
 * IAM Delete — delete an IAM app, business catalog, role template or assignment
 */

import type { AsyncResult } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { AdtRequestor } from '../types';
import type { IamObjectKind } from './types';
import { extractError, safeParseXml } from '../../utils/xml';
import { ADTCORE_NS, KIND_LABELS, iamObjectPath, lockIamObject, unlockIamObject } from './helpers';

const USAGE_NS = 'http://www.sap.com/adt/ris/usageReferences';
const USAGE_PATH = '/sap/bc/adt/repository/informationsystem/usageReferences';
// SWB_TOOL 029 "Error while deleting object App from the database": the app is still in a catalog.
const STILL_ASSIGNED = /SWB_TOOL[\s\S]*029|029[\s\S]*SWB_TOOL/;
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
    const objectName = name.toUpperCase();
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
    if (kind === 'sia6' && STILL_ASSIGNED.test(text)) return err(await stillAssignedError(client, objectName));
    if (unlockErr) return err(new Error(`Failed to delete ${label}: ${extractError(text)} (unlock also failed: ${unlockErr.message})`));
    return err(new Error(`Failed to delete ${label}: ${extractError(text)}`));
}

// Name the catalogs (where-used lists them) in the error; best effort.
async function stillAssignedError(client: AdtRequestor, appName: string): Promise<Error> {
    const catalogs = await assignedCatalogs(client, appName);
    const where = catalogs.length > 0 ? ` (${catalogs.join(', ')})` : '';
    return new Error(`Cannot delete IAM app ${appName}: it is still assigned to a business catalog${where}; remove the app from its business catalogs first (delete the SIA7 assignments)`);
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
