/**
 * Cloud IAM helpers — shared paths, read, lock and publish-status handling
 *
 * Internal helpers used across the iam files. Not exported from the adt/ barrel.
 * IAM objects are "blues" form documents: no source, no inactive version — a
 * create or PUT is live at once, so there is no activation step.
 */

import type { AsyncResult, Result } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { AdtRequestor } from '../types';
import type { IamObjectKind } from './types';
import { extractLockHandle } from '../../utils/xml';
import { checkResponse } from '../helpers';

export const IAM_BASE_PATH = '/sap/bc/adt/aps/cloud/iam';
export const BLUES_CONTENT_TYPE = 'application/vnd.sap.adt.blues.v1+xml';
export const PUBLISHING_CONTENT_TYPE = 'application/vnd.sap.adt.iam.publishing+xml';
export const ADTCORE_NS = 'http://www.sap.com/adt/core';
// adtcore:description limit of IAM objects
const DESCRIPTION_MAX_LENGTH = 60;

const LOCK_ACCEPT_HEADER =
    'application/*,application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.result';
const NOT_FOUND_STATUS = 404;
const PUBLISHED_STATUS = 'p';

export const KIND_LABELS: Record<IamObjectKind, string> = {
    sia6: 'IAM app',
    sia1: 'business catalog',
    sia7: 'business catalog app assignment',
    sia8: 'business role template',
    sia9: 'business role template catalog assignment',
};

/** ADT collection path for an IAM object kind. */
export function iamCollectionPath(kind: IamObjectKind): string {
    return `${IAM_BASE_PATH}/${kind}`;
}

/** ADT resource path for an IAM object (namespaced names such as /ABC/X are encoded). */
export function iamObjectPath(kind: IamObjectKind, name: string): string {
    return `${iamCollectionPath(kind)}/${encodeURIComponent(name.trim().toLowerCase())}`;
}

/** An IAM object name as SAP stores it: trimmed, upper case. */
export function iamName(name: string): string {
    return name.trim().toUpperCase();
}

/**
 * Refuse an existing object that lives in another package than the one asked for.
 *
 * @param kind - IAM object kind
 * @param name - Object name
 * @param actual - Package the object is in ('' when unknown)
 * @param requested - Package asked for
 * @returns void or error
 */
export function requireSamePackage(kind: IamObjectKind, name: string, actual: string, requested: string): Result<void, Error> {
    if (!actual || actual.toUpperCase() === iamName(requested)) return ok(undefined);
    return err(new Error(`${KIND_LABELS[kind]} ${name} already exists in package ${actual.toUpperCase()}, not ${iamName(requested)}; use that package or another name`));
}

/**
 * Check that a listing response has the expected root (a 200 logon page is not an empty listing).
 *
 * @param doc - Parsed response
 * @param ns - Expected root namespace
 * @param localName - Expected root local name
 * @param what - What was listed (for the error)
 * @returns void or error
 */
export function requireRoot(doc: Document, ns: string, localName: string, what: string): Result<void, Error> {
    const root = doc.documentElement;
    if (root && root.namespaceURI === ns && root.localName === localName) return ok(undefined);
    return err(new Error(`${what}: unexpected response (root ${root?.localName ?? 'none'}, expected ${localName})`));
}

/** A description cut to the IAM limit (SAP rejects a create without one). */
export function iamDescription(text: string): string {
    return text.slice(0, DESCRIPTION_MAX_LENGTH);
}

/** Whether a publishStatus / publishingStatusText code means published. */
export function isPublished(status: string): boolean {
    return status === PUBLISHED_STATUS;
}

/**
 * Read an IAM object's blues document.
 *
 * @param client - ADT client
 * @param kind - IAM object kind
 * @param name - Object name
 * @returns The XML, null when the object does not exist, or error
 */
export async function readIamDocument(
    client: AdtRequestor,
    kind: IamObjectKind,
    name: string
): AsyncResult<string | null, Error> {
    const [response, requestErr] = await client.request({
        method: 'GET',
        path: iamObjectPath(kind, name),
        headers: { 'Accept': BLUES_CONTENT_TYPE },
    });
    if (!requestErr && response?.status === NOT_FOUND_STATUS) return ok(null);

    const [text, checkErr] = await checkResponse(response, requestErr, `Failed to read ${KIND_LABELS[kind]} ${name}`);
    if (checkErr) return err(checkErr);
    return ok(text);
}

/**
 * Create an IAM object from its blues document.
 *
 * @param client - ADT client
 * @param kind - IAM object kind
 * @param name - Object name (for error messages)
 * @param body - Blues XML document
 * @param transport - Transport request (required for non-$TMP packages)
 * @returns The created document or error
 */
export async function createIamDocument(
    client: AdtRequestor,
    kind: IamObjectKind,
    name: string,
    body: string,
    transport?: string
): AsyncResult<string, Error> {
    const params: Record<string, string> = {};
    if (transport) params['corrNr'] = transport;

    const [response, requestErr] = await client.request({
        method: 'POST',
        path: iamCollectionPath(kind),
        params,
        headers: { 'Content-Type': BLUES_CONTENT_TYPE, 'Accept': BLUES_CONTENT_TYPE },
        body,
    });

    return checkResponse(response, requestErr, `Failed to create ${KIND_LABELS[kind]} ${name}`);
}

/**
 * Lock an IAM object for modification.
 *
 * @param client - ADT client
 * @param kind - IAM object kind
 * @param name - Object name
 * @returns Lock handle or error
 */
export async function lockIamObject(
    client: AdtRequestor,
    kind: IamObjectKind,
    name: string
): AsyncResult<string, Error> {
    const [response, requestErr] = await client.request({
        method: 'POST',
        path: iamObjectPath(kind, name),
        params: { '_action': 'LOCK', 'accessMode': 'MODIFY' },
        headers: { 'Accept': LOCK_ACCEPT_HEADER },
    });

    const [text, checkErr] = await checkResponse(response, requestErr, `Failed to lock ${KIND_LABELS[kind]} ${name}`);
    if (checkErr) return err(checkErr);

    const [lockHandle, extractErr] = extractLockHandle(text);
    if (extractErr) return err(new Error(`Failed to extract lock handle: ${extractErr.message}`));
    return ok(lockHandle);
}

/**
 * Unlock an IAM object.
 *
 * @param client - ADT client
 * @param kind - IAM object kind
 * @param name - Object name
 * @param lockHandle - Lock handle from lockIamObject()
 * @returns void or error
 */
export async function unlockIamObject(
    client: AdtRequestor,
    kind: IamObjectKind,
    name: string,
    lockHandle: string
): AsyncResult<void, Error> {
    const [response, requestErr] = await client.request({
        method: 'POST',
        path: iamObjectPath(kind, name),
        params: { '_action': 'UNLOCK', 'lockHandle': lockHandle },
    });

    const [, checkErr] = await checkResponse(response, requestErr, `Failed to unlock ${KIND_LABELS[kind]} ${name}`);
    if (checkErr) return err(checkErr);
    return ok(undefined);
}
