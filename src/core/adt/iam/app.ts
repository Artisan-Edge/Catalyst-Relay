/**
 * IAM App (SIA6) — create, read, add services to and publish an IAM app
 */

import { XMLSerializer } from '@xmldom/xmldom';
import type { AsyncResult, Result } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { AdtRequestor } from '../types';
import type { IamAppInfo, IamAppService, IamServiceRef } from './types';
import { escapeXml, safeParseXml } from '../../utils/xml';
import { checkResponse } from '../helpers';
import {
    ADTCORE_NS,
    BLUES_CONTENT_TYPE,
    IAM_BASE_PATH,
    createIamDocument,
    iamObjectPath,
    lockIamObject,
    readIamDocument,
    submitIamPublish,
    unlockIamObject,
} from './helpers';

const SIA6_NS = 'http://www.sap.com/iam/sia6';
const ATOM_NS = 'http://www.w3.org/2005/Atom';
const NAMEDITEM_NS = 'http://www.sap.com/adt/nameditem';
const SERVICE_VALUES_PATH = `${IAM_BASE_PATH}/sia6/service/values`;
const SERVICE_DETAIL_PATH = `${IAM_BASE_PATH}/sia6/service/detail`;
const SERVICE_DETAIL_ACCEPT = 'application/vnd.sap.adt.iam.servicedetail+xml';
const PUBLISH_PATH = `${IAM_BASE_PATH}/sia6/publish`;
const DEFAULT_APP_TYPE = 'EXT';
const DEFAULT_IWSV_VERSION = '0001';
// The service elements an IAM app stores per listed service, in document order.
const SERVICE_FIELDS = ['srvcType', 'srvcName', 'relServiceName', 'relServiceType', 'typeText', 'srvcDescription', 'uiadSource', 'transactionCodeSource'] as const;

/**
 * Create an empty IAM app.
 *
 * @param client - ADT client
 * @param name - IAM app name
 * @param packageName - Target package
 * @param description - App description
 * @param appType - Application type (default 'EXT')
 * @param transport - Transport request
 * @returns void or error
 */
export async function createIamAppObject(
    client: AdtRequestor,
    name: string,
    packageName: string,
    description: string,
    appType = DEFAULT_APP_TYPE,
    transport?: string
): AsyncResult<void, Error> {
    const appName = name.toUpperCase();
    const body = `<?xml version="1.0" encoding="UTF-8"?>
<sia6:sia6 xmlns:sia6="${SIA6_NS}" xmlns:adtcore="${ADTCORE_NS}" adtcore:description="${escapeXml(description)}" adtcore:language="EN" adtcore:name="${appName}" adtcore:type="SIA6" adtcore:masterLanguage="EN">
  <adtcore:packageRef adtcore:name="${packageName.toUpperCase()}"/>
  <sia6:content>
    <sia6:appID>${appName}</sia6:appID>
    <sia6:appType>${escapeXml(appType.toUpperCase())}</sia6:appType>
  </sia6:content>
</sia6:sia6>`;

    const [, createErr] = await createIamDocument(client, 'sia6', appName, body, transport);
    if (createErr) return err(createErr);
    return ok(undefined);
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
        services.push({
            name: childText(element, 'relServiceName'),
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
        services,
        publishStatus: childText(root, 'publishStatus'),
    });
}

/**
 * Add services to an IAM app's Services tab.
 *
 * Each service is resolved through the IAM service value help and service detail
 * (which supply the runtime key SAP derives), then all are saved in one locked PUT.
 *
 * @param client - ADT client
 * @param name - IAM app name
 * @param services - Services to add (must not already be listed)
 * @param transport - Transport request
 * @returns void or error
 */
export async function addIamAppServices(
    client: AdtRequestor,
    name: string,
    services: IamServiceRef[],
    transport?: string
): AsyncResult<void, Error> {
    if (services.length === 0) return ok(undefined);
    const appName = name.toUpperCase();

    // Resolve every service before taking the lock.
    const details: Record<string, string>[] = [];
    for (const service of services) {
        const [detail, detailErr] = await resolveIamService(client, appName, service);
        if (detailErr) return err(detailErr);
        details.push(detail);
    }

    const [lockHandle, lockErr] = await lockIamObject(client, 'sia6', appName);
    if (lockErr) return err(lockErr);

    const [, saveErr] = await saveServices(client, appName, details, lockHandle, transport);

    // Always release the lock, even if the save failed.
    const [, unlockErr] = await unlockIamObject(client, 'sia6', appName, lockHandle);
    if (saveErr) return err(saveErr);
    if (unlockErr) return err(unlockErr);
    return ok(undefined);
}

/**
 * Publish an IAM app locally.
 *
 * @param client - ADT client
 * @param name - IAM app name
 * @returns Publishing status code ('p' when published) or error
 */
export async function publishIamApp(
    client: AdtRequestor,
    name: string
): AsyncResult<string, Error> {
    return submitIamPublish(client, PUBLISH_PATH, { application: name.toUpperCase() }, `IAM app ${name}`);
}

// GET the document, append the service elements, PUT it back under the lock.
async function saveServices(
    client: AdtRequestor,
    appName: string,
    details: Record<string, string>[],
    lockHandle: string,
    transport?: string
): AsyncResult<void, Error> {
    const [xml, readErr] = await readIamDocument(client, 'sia6', appName);
    if (readErr) return err(readErr);
    if (xml === null) return err(new Error(`IAM app ${appName} does not exist`));

    const [body, buildErr] = appendServices(xml, details);
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

    const [, checkErr] = await checkResponse(response, requestErr, `Failed to save services of IAM app ${appName}`);
    if (checkErr) return err(checkErr);
    return ok(undefined);
}

/**
 * Append resolved services to an IAM app document (atom links are dropped).
 *
 * @param xml - IAM app blues XML as read
 * @param details - Resolved service fields, keyed by SERVICE_FIELDS names
 * @returns The document to PUT, or error
 */
export function appendServices(xml: string, details: Record<string, string>[]): Result<string, Error> {
    const [doc, parseErr] = safeParseXml(xml);
    if (parseErr) return err(parseErr);
    const root = doc.documentElement;
    if (!root || root.namespaceURI !== SIA6_NS) return err(new Error('Not an IAM app document'));

    const links = root.getElementsByTagNameNS(ATOM_NS, 'link');
    for (let i = links.length - 1; i >= 0; i--) {
        const link = links[i];
        link?.parentNode?.removeChild(link);
    }

    const container = root.getElementsByTagNameNS(SIA6_NS, 'services')[0];
    if (!container) return err(new Error('IAM app document has no sia6:services element'));

    for (const detail of details) {
        const service = doc.createElementNS(SIA6_NS, 'sia6:service');
        for (const field of SERVICE_FIELDS) {
            const element = doc.createElementNS(SIA6_NS, `sia6:${field}`);
            const value = detail[field] ?? '';
            if (value) element.appendChild(doc.createTextNode(value));
            service.appendChild(element);
        }
        container.appendChild(service);
    }

    return ok(new XMLSerializer().serializeToString(doc));
}

// Value help → the service's key as SAP lists it; service detail → the fields an app row stores.
async function resolveIamService(
    client: AdtRequestor,
    appName: string,
    service: IamServiceRef
): AsyncResult<Record<string, string>, Error> {
    const [key, keyErr] = await findServiceKey(client, service);
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
    if (!detail['srvcName']) return err(new Error(`Service detail for ${service.type} service ${service.name} carries no runtime service name`));
    return ok(detail);
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
