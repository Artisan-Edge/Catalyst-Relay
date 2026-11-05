/**
 * IAM App (SIA6) — create, read, change (services, UI5 app ID, migration) and publish an IAM app
 */

import { XMLSerializer } from '@xmldom/xmldom';
import type { AsyncResult, Result } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { AdtRequestor } from '../types';
import type { IamAppInfo, IamAppService, IamPublishOptions, IamServiceRef } from './types';
import { escapeXml, safeParseXml } from '../../utils/xml';
import { checkResponse } from '../helpers';
import {
    ADTCORE_NS,
    BLUES_CONTENT_TYPE,
    IAM_BASE_PATH,
    PUBLISHING_CONTENT_TYPE,
    createIamDocument,
    iamObjectPath,
    lockIamObject,
    readIamDocument,
    unlockIamObject,
} from './helpers';
import { publishAndWait } from './publish';
import { splitServiceName } from './serviceName';

const SIA6_NS = 'http://www.sap.com/iam/sia6';
const ATOM_NS = 'http://www.w3.org/2005/Atom';
const NAMEDITEM_NS = 'http://www.sap.com/adt/nameditem';
const SERVICE_VALUES_PATH = `${IAM_BASE_PATH}/sia6/service/values`;
const SERVICE_DETAIL_PATH = `${IAM_BASE_PATH}/sia6/service/detail`;
const SERVICE_DETAIL_ACCEPT = 'application/vnd.sap.adt.iam.servicedetail+xml';
const PUBLISH_PATH = `${IAM_BASE_PATH}/sia6/publish`;
const PUBLISHED_STATUS = 'p';
const DEFAULT_APP_TYPE = 'EXT';
const DEFAULT_IWSV_VERSION = '0001';
const INA1_SERVICE_TYPE = 'INA1';
/** migrationStatus of a migrated app; a catalog (created at 3) refuses apps without it */
export const MIGRATED_STATUS = '3';
// The service elements an IAM app stores per listed service, in document order.
const SERVICE_FIELDS = ['srvcType', 'srvcName', 'relServiceName', 'relServiceType', 'typeText', 'srvcDescription', 'uiadSource', 'transactionCodeSource'] as const;

/** Changes to save in one full-document PUT of an IAM app */
export interface IamAppChanges {
    /** Resolved service rows to append, keyed by SERVICE_FIELDS names */
    services?: Record<string, string>[];
    ui5AppId?: string;
    migrationStatus?: string;
}

/**
 * Create an empty IAM app.
 *
 * @param client - ADT client
 * @param name - IAM app name
 * @param packageName - Target package
 * @param description - App description
 * @param appType - Application type (default 'EXT')
 * @param transport - Transport request
 * @returns The app as created or error
 */
export async function createIamAppObject(
    client: AdtRequestor,
    name: string,
    packageName: string,
    description: string,
    appType = DEFAULT_APP_TYPE,
    transport?: string
): AsyncResult<IamAppInfo, Error> {
    const appName = name.toUpperCase();
    const body = `<?xml version="1.0" encoding="UTF-8"?>
<sia6:sia6 xmlns:sia6="${SIA6_NS}" xmlns:adtcore="${ADTCORE_NS}" adtcore:description="${escapeXml(description)}" adtcore:language="EN" adtcore:name="${appName}" adtcore:type="SIA6" adtcore:masterLanguage="EN">
  <adtcore:packageRef adtcore:name="${packageName.toUpperCase()}"/>
  <sia6:content>
    <sia6:appID>${appName}</sia6:appID>
    <sia6:appType>${escapeXml(appType.toUpperCase())}</sia6:appType>
  </sia6:content>
</sia6:sia6>`;

    const [created, createErr] = await createIamDocument(client, 'sia6', appName, body, transport);
    if (createErr) return err(createErr);
    return parseIamApp(created, appName);
}

/**
 * Read an IAM app.
 *
 * @param client - ADT client
 * @param name - IAM app name
 * @returns The app, null when it does not exist, or error
 */
export async function readIamApp(
    client: AdtRequestor,
    name: string
): AsyncResult<IamAppInfo | null, Error> {
    const [xml, readErr] = await readIamDocument(client, 'sia6', name);
    if (readErr) return err(readErr);
    if (xml === null) return ok(null);
    return parseIamApp(xml, name);
}

/**
 * Parse an IAM app blues document.
 *
 * @param xml - Blues XML
 * @param name - IAM app name (for error messages)
 * @returns The app or error
 */
export function parseIamApp(xml: string, name: string): Result<IamAppInfo, Error> {
    const [doc, parseErr] = safeParseXml(xml);
    if (parseErr) return err(parseErr);

    const root = doc.documentElement;
    if (!root || root.namespaceURI !== SIA6_NS) return err(new Error(`IAM app ${name} response is not an IAM app document`));

    const services: IamAppService[] = [];
    const serviceElements = root.getElementsByTagNameNS(SIA6_NS, 'service');
    for (let i = 0; i < serviceElements.length; i++) {
        const element = serviceElements[i];
        if (!element) continue;
        const { name: serviceName, version } = splitServiceName(childText(element, 'relServiceName'));
        services.push({
            name: serviceName,
            version,
            type: childText(element, 'relServiceType'),
            typeText: childText(element, 'typeText'),
            description: childText(element, 'srvcDescription'),
            runtimeType: childText(element, 'srvcType'),
            runtimeName: childText(element, 'srvcName'),
        });
    }

    const packageRef = root.getElementsByTagNameNS(ADTCORE_NS, 'packageRef')[0];
    return ok({
        name: root.getAttributeNS(ADTCORE_NS, 'name') || name.toUpperCase(),
        description: root.getAttributeNS(ADTCORE_NS, 'description') ?? '',
        packageName: packageRef?.getAttributeNS(ADTCORE_NS, 'name') ?? '',
        appType: childText(root, 'appType'),
        ui5AppId: childText(root, 'ui5AppId'),
        services,
        publishStatus: childText(root, 'publishStatus'),
        migrationStatus: root.getElementsByTagNameNS(SIA6_NS, 'migrationStatus')[0] ? childText(root, 'migrationStatus') : null,
    });
}

/**
 * Set migrationStatus 3 on an app whose migrationStatus element is empty (a guard for older apps and
 * other tenants; a catalog refuses unmigrated apps). An app without the element is left alone.
 *
 * @param client - ADT client
 * @param name - IAM app name
 * @param transport - Transport request
 * @returns true when the app was migrated, false when it already was, or error
 */
export async function ensureIamAppMigrated(
    client: AdtRequestor,
    name: string,
    transport?: string
): AsyncResult<boolean, Error> {
    const [app, readErr] = await readIamApp(client, name);
    if (readErr) return err(readErr);
    if (!app) return err(new Error(`IAM app ${name.toUpperCase()} does not exist`));
    if (!needsMigration(app)) return ok(false);

    const [, saveErr] = await saveIamAppChanges(client, name, { migrationStatus: MIGRATED_STATUS }, transport);
    if (saveErr) return err(saveErr);
    return ok(true);
}

/** Whether the app's migrationStatus element exists and is empty */
export function needsMigration(app: IamAppInfo): boolean {
    return app.migrationStatus === '';
}

/**
 * Resolve services to the rows an IAM app stores (resolve before taking a lock).
 *
 * G4BA and IWSV go through the service value help, then the service detail; INA1 (an InA
 * binding) goes to the service detail directly by binding name.
 *
 * @param client - ADT client
 * @param name - IAM app name
 * @param services - Services to resolve
 * @returns Rows keyed by SERVICE_FIELDS names, or error
 */
export async function resolveIamServices(
    client: AdtRequestor,
    name: string,
    services: IamServiceRef[]
): AsyncResult<Record<string, string>[], Error> {
    const appName = name.toUpperCase();
    const details: Record<string, string>[] = [];
    for (const service of services) {
        const [detail, detailErr] = await resolveIamService(client, appName, service);
        if (detailErr) return err(detailErr);
        details.push(detail);
    }
    return ok(details);
}

/**
 * Save changes in one locked full-document PUT: read the app, edit it, PUT it back, unlock.
 *
 * @param client - ADT client
 * @param name - IAM app name
 * @param changes - Resolved services to append, UI5 app ID, migration status
 * @param transport - Transport request
 * @returns void or error
 */
export async function saveIamAppChanges(
    client: AdtRequestor,
    name: string,
    changes: IamAppChanges,
    transport?: string
): AsyncResult<void, Error> {
    const appName = name.toUpperCase();
    const [lockHandle, lockErr] = await lockIamObject(client, 'sia6', appName);
    if (lockErr) return err(lockErr);

    const [, saveErr] = await putChanges(client, appName, changes, lockHandle, transport);

    // Always release the lock, even if the save failed.
    const [, unlockErr] = await unlockIamObject(client, 'sia6', appName, lockHandle);
    if (saveErr) return err(saveErr);
    if (unlockErr) return err(unlockErr);
    return ok(undefined);
}

/**
 * Publish an IAM app locally and wait until SAP reports it published ('p').
 *
 * @param client - ADT client
 * @param name - IAM app name
 * @param options - Publish timing
 * @returns Publishing status code ('p') or error
 */
export async function publishIamApp(
    client: AdtRequestor,
    name: string,
    options?: IamPublishOptions
): AsyncResult<string, Error> {
    return publishAndWait(client, {
        path: PUBLISH_PATH,
        params: { application: name.toUpperCase() },
        accept: PUBLISHING_CONTENT_TYPE,
        label: `IAM app ${name.toUpperCase()}`,
        doneStatuses: [PUBLISHED_STATUS],
    }, options);
}

// GET the document under the lock, edit it, PUT it back.
async function putChanges(
    client: AdtRequestor,
    appName: string,
    changes: IamAppChanges,
    lockHandle: string,
    transport?: string
): AsyncResult<void, Error> {
    const [xml, readErr] = await readIamDocument(client, 'sia6', appName);
    if (readErr) return err(readErr);
    if (xml === null) return err(new Error(`IAM app ${appName} does not exist`));

    const [body, buildErr] = applyIamAppChanges(xml, changes);
    if (buildErr) return err(buildErr);

    const params: Record<string, string> = { lockHandle };
    if (transport) params['corrNr'] = transport;

    const [response, requestErr] = await client.request({
        method: 'PUT',
        path: iamObjectPath('sia6', appName),
        params,
        headers: { 'Content-Type': BLUES_CONTENT_TYPE, 'Accept': BLUES_CONTENT_TYPE },
        body,
    });

    const [, checkErr] = await checkResponse(response, requestErr, `Failed to save IAM app ${appName}`);
    if (checkErr) return err(checkErr);
    return ok(undefined);
}

/**
 * Apply changes to an IAM app document (atom links are dropped).
 *
 * @param xml - IAM app blues XML as read
 * @param changes - Service rows to append, UI5 app ID and migration status to set (migrationStatus only
 *   where the element exists; SAP owns whether it is there)
 * @returns The document to PUT, or error
 */
export function applyIamAppChanges(xml: string, changes: IamAppChanges): Result<string, Error> {
    const [doc, parseErr] = safeParseXml(xml);
    if (parseErr) return err(parseErr);
    const root = doc.documentElement;
    if (!root || root.namespaceURI !== SIA6_NS) return err(new Error('Not an IAM app document'));

    const links = root.getElementsByTagNameNS(ATOM_NS, 'link');
    for (let i = links.length - 1; i >= 0; i--) {
        const link = links[i];
        link?.parentNode?.removeChild(link);
    }

    const content = root.getElementsByTagNameNS(SIA6_NS, 'content')[0];
    if (!content) return err(new Error('IAM app document has no sia6:content element'));

    if (changes.services && changes.services.length > 0) {
        const container = root.getElementsByTagNameNS(SIA6_NS, 'services')[0];
        if (!container) return err(new Error('IAM app document has no sia6:services element'));
        for (const detail of changes.services) {
            const service = doc.createElementNS(SIA6_NS, 'sia6:service');
            for (const field of SERVICE_FIELDS) {
                const element = doc.createElementNS(SIA6_NS, `sia6:${field}`);
                const value = detail[field] ?? '';
                if (value) element.appendChild(doc.createTextNode(value));
                service.appendChild(element);
            }
            container.appendChild(service);
        }
    }

    if (changes.ui5AppId !== undefined) setChildText(doc, content, 'ui5AppId', changes.ui5AppId, 'appType');
    if (changes.migrationStatus !== undefined) setChildText(doc, content, 'migrationStatus', changes.migrationStatus, null);

    return ok(new XMLSerializer().serializeToString(doc));
}

// Set <sia6:localName> under content; a missing element goes after `after`, or is left out when `after` is null.
function setChildText(doc: Document, content: Element, localName: string, value: string, after: string | null): void {
    let element = content.getElementsByTagNameNS(SIA6_NS, localName)[0];
    if (!element) {
        if (after === null) return;
        element = doc.createElementNS(SIA6_NS, `sia6:${localName}`);
        const anchor = content.getElementsByTagNameNS(SIA6_NS, after)[0];
        content.insertBefore(element, anchor?.nextSibling ?? null);
    }
    while (element.firstChild) element.removeChild(element.firstChild);
    if (value) element.appendChild(doc.createTextNode(value));
}

// G4BA / IWSV: value help → the service's key as SAP lists it; INA1: the binding name. Then the service detail.
async function resolveIamService(
    client: AdtRequestor,
    appName: string,
    service: IamServiceRef
): AsyncResult<Record<string, string>, Error> {
    const [key, keyErr] = service.type === INA1_SERVICE_TYPE ? [service.name.toUpperCase(), null] as const : await findServiceKey(client, service);
    if (keyErr) return err(keyErr);

    const [response, requestErr] = await client.request({
        method: 'GET',
        path: SERVICE_DETAIL_PATH,
        params: { serviceName: key, serviceType: service.type, appName },
        headers: { 'Accept': SERVICE_DETAIL_ACCEPT },
    });

    const [text, checkErr] = await checkResponse(response, requestErr, `Failed to resolve ${service.type} service ${service.name}`);
    if (checkErr) return err(checkErr);

    const [doc, parseErr] = safeParseXml(text);
    if (parseErr) return err(parseErr);
    const root = doc.documentElement;
    if (!root) return err(new Error(`Empty service detail for ${service.name}`));

    const detail: Record<string, string> = {};
    for (const field of SERVICE_FIELDS) detail[field] = childText(root, field);
    if (detail['srvcName']) return ok(detail);
    if (service.type === INA1_SERVICE_TYPE) return err(new Error(`InA service binding ${key} has no INA1 service; check the name and that the binding is active`));
    return err(new Error(`Service detail for ${service.type} service ${service.name} carries no runtime service name`));
}

// G4BA items are the binding name; IWSV items are "<SERVICE><padding><VERSION>".
async function findServiceKey(client: AdtRequestor, service: IamServiceRef): AsyncResult<string, Error> {
    const name = service.name.toUpperCase();
    const version = service.version ?? DEFAULT_IWSV_VERSION;

    const [response, requestErr] = await client.request({
        method: 'GET',
        path: SERVICE_VALUES_PATH,
        params: { name: `${name}*`, data: service.type },
        headers: { 'Accept': 'application/vnd.sap.adt.nameditems.v1+xml' },
    });

    const [text, checkErr] = await checkResponse(response, requestErr, `Failed to look up ${service.type} service ${service.name}`);
    if (checkErr) return err(checkErr);

    const [doc, parseErr] = safeParseXml(text);
    if (parseErr) return err(parseErr);

    const items = doc.getElementsByTagNameNS(NAMEDITEM_NS, 'name');
    for (let i = 0; i < items.length; i++) {
        const key = items[i]?.textContent ?? '';
        const [itemName, itemVersion] = key.trim().split(/\s+/);
        if (itemName !== name) continue;
        if (service.type === 'IWSV' && itemVersion !== version) continue;
        return ok(key);
    }

    const what = service.type === 'IWSV' ? `OData V2 service ${name} version ${version}` : `OData V4 service binding ${name}`;
    return err(new Error(`${what} is not offered by the IAM service value help; check the name and that the binding is published`));
}

// Text of the first descendant <sia6:localName>, or '' when absent.
function childText(parent: Element, localName: string): string {
    return parent.getElementsByTagNameNS(SIA6_NS, localName)[0]?.textContent?.trim() ?? '';
}
