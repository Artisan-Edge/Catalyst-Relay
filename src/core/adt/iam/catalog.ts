/**
 * Business Catalog (SIA1) and its app assignments (SIA7) — create, read, assign and publish
 */

import type { AsyncResult, Result } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { AdtRequestor } from '../types';
import type { BusinessCatalogInfo, CatalogAppAssignment, IamPublishOptions } from './types';
import type { IamPublishError } from './publish';
import { escapeXml, safeParseXml } from '../../utils/xml';
import { checkResponse } from '../helpers';
import { ADTCORE_NS, IAM_BASE_PATH, createIamDocument, iamDescription, iamName, isPublished, readIamDocument, requireRoot } from './helpers';
import { publishAndWait } from './publish';

const SIA1_NS = 'http://www.sap.com/iam/sia1';
const SIA7_NS = 'http://www.sap.com/iam/sia7';
const ASSIGNMENTS_PATH = `${IAM_BASE_PATH}/sia1/$bucapps`;
const ASSIGNMENTS_ROOT = 'bucapps';
const PUBLISH_PATH = `${IAM_BASE_PATH}/sia1/$publish`;
// SAP's own client sends Accept */* to $publish (captured)
const PUBLISH_ACCEPT = '*/*';
const PUBLISHED_STATUS = 'p';

/**
 * Create an empty business catalog.
 *
 * @param client - ADT client
 * @param name - Business catalog name
 * @param packageName - Target package
 * @param description - Catalog description (cut to 60 characters)
 * @param transport - Transport request
 * @returns void or error
 */
export async function createBusinessCatalogObject(
    client: AdtRequestor,
    name: string,
    packageName: string,
    description: string,
    transport?: string
): AsyncResult<void, Error> {
    const catalogName = iamName(name);
    const body = `<?xml version="1.0" encoding="UTF-8"?>
<sia1:sia1 xmlns:sia1="${SIA1_NS}" xmlns:adtcore="${ADTCORE_NS}" adtcore:description="${escapeXml(iamDescription(description || catalogName))}" adtcore:language="EN" adtcore:name="${escapeXml(catalogName)}" adtcore:type="SIA1" adtcore:masterLanguage="EN">
  <adtcore:packageRef adtcore:name="${escapeXml(iamName(packageName))}"/>
  <sia1:content>
    <sia1:businessCatalogID>${escapeXml(catalogName)}</sia1:businessCatalogID>
  </sia1:content>
</sia1:sia1>`;

    const [, createErr] = await createIamDocument(client, 'sia1', catalogName, body, transport);
    if (createErr) return err(createErr);
    return ok(undefined);
}

/**
 * Read a business catalog and the IAM apps assigned to it.
 *
 * @param client - ADT client
 * @param name - Business catalog name
 * @returns The catalog, null when it does not exist, or error
 */
export async function readBusinessCatalog(
    client: AdtRequestor,
    name: string
): AsyncResult<BusinessCatalogInfo | null, Error> {
    const [xml, readErr] = await readIamDocument(client, 'sia1', iamName(name));
    if (readErr) return err(readErr);
    if (xml === null) return ok(null);

    const [catalog, parseErr] = parseBusinessCatalog(xml, iamName(name));
    if (parseErr) return err(parseErr);

    const [apps, appsErr] = await readCatalogAssignments(client, catalog.name);
    if (appsErr) return err(appsErr);

    return ok({ ...catalog, apps });
}

/**
 * Parse a business catalog blues document (apps are read separately).
 *
 * @param xml - Blues XML
 * @param name - Catalog name (for error messages)
 * @returns The catalog without its apps, or error
 */
export function parseBusinessCatalog(xml: string, name: string): Result<BusinessCatalogInfo, Error> {
    const [doc, parseErr] = safeParseXml(xml);
    if (parseErr) return err(parseErr);

    const root = doc.documentElement;
    if (!root || root.namespaceURI !== SIA1_NS) return err(new Error(`Business catalog ${name} response is not a business catalog document`));

    const publishStatus = root.getElementsByTagNameNS(SIA1_NS, 'publishStatus')[0]?.textContent?.trim() ?? '';
    const packageRef = root.getElementsByTagNameNS(ADTCORE_NS, 'packageRef')[0];
    return ok({
        name: root.getAttributeNS(ADTCORE_NS, 'name') || name.toUpperCase(),
        description: root.getAttributeNS(ADTCORE_NS, 'description') ?? '',
        packageName: packageRef?.getAttributeNS(ADTCORE_NS, 'name') ?? '',
        apps: [],
        publishStatus,
        published: isPublished(publishStatus),
    });
}

/**
 * List the IAM app assignments of a business catalog.
 *
 * @param client - ADT client
 * @param name - Business catalog name
 * @returns Assignments or error (also for a 200 that is not a bucapps listing)
 */
export async function readCatalogAssignments(
    client: AdtRequestor,
    name: string
): AsyncResult<CatalogAppAssignment[], Error> {
    const catalogName = iamName(name);
    const [response, requestErr] = await client.request({
        method: 'GET',
        path: ASSIGNMENTS_PATH,
        params: { name: catalogName },
    });

    const what = `Failed to list the apps of business catalog ${catalogName}`;
    const [text, checkErr] = await checkResponse(response, requestErr, what);
    if (checkErr) return err(checkErr);
    return parseCatalogAssignments(text, what);
}

/**
 * Parse a $bucapps listing.
 *
 * @param xml - sia1:bucapps
 * @param what - Error context
 * @returns Assignments or error
 */
export function parseCatalogAssignments(xml: string, what = 'Business catalog assignments'): Result<CatalogAppAssignment[], Error> {
    const [doc, parseErr] = safeParseXml(xml);
    if (parseErr) return err(new Error(`${what}: ${parseErr.message}`));
    const [, rootErr] = requireRoot(doc, SIA1_NS, ASSIGNMENTS_ROOT, what);
    if (rootErr) return err(rootErr);

    const assignments: CatalogAppAssignment[] = [];
    const entries = doc.getElementsByTagNameNS(SIA1_NS, 'bucapp');
    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        if (!entry) continue;
        const assignment = entry.getElementsByTagNameNS(SIA1_NS, 'businessCatalogAppAssignmentID')[0]?.textContent?.trim() ?? '';
        const app = entry.getElementsByTagNameNS(SIA1_NS, 'appID')[0]?.textContent?.trim() ?? '';
        if (assignment && app) assignments.push({ assignment, app });
    }
    return ok(assignments);
}

/**
 * Assign an IAM app to a business catalog (creates the SIA7 assignment object).
 *
 * @param client - ADT client
 * @param catalogName - Business catalog name
 * @param appName - IAM app name
 * @param assignmentName - Assignment object name (<catalog>_<NNNN>)
 * @param packageName - Target package
 * @param transport - Transport request
 * @param description - Assignment description (default "<app> in <catalog>"; SAP rejects an assignment without one)
 * @returns void or error
 */
export async function createCatalogAssignment(
    client: AdtRequestor,
    catalogName: string,
    appName: string,
    assignmentName: string,
    packageName: string,
    transport?: string,
    description?: string
): AsyncResult<void, Error> {
    const catalog = iamName(catalogName);
    const app = iamName(appName);
    const assignment = iamName(assignmentName);
    const text = iamDescription(description || `${app} in ${catalog}`);

    const body = `<?xml version="1.0" encoding="UTF-8"?>
<sia7:sia7 xmlns:sia7="${SIA7_NS}" xmlns:adtcore="${ADTCORE_NS}" adtcore:description="${escapeXml(text)}" adtcore:language="EN" adtcore:name="${escapeXml(assignment)}" adtcore:type="SIA7" adtcore:masterLanguage="EN">
  <adtcore:packageRef adtcore:name="${escapeXml(iamName(packageName))}"/>
  <sia7:content>
    <sia7:businessCatalogAppAssignmentID>${escapeXml(assignment)}</sia7:businessCatalogAppAssignmentID>
    <sia7:businessCatalogID>${escapeXml(catalog)}</sia7:businessCatalogID>
    <sia7:appID>${escapeXml(app)}</sia7:appID>
  </sia7:content>
</sia7:sia7>`;

    const [, createErr] = await createIamDocument(client, 'sia7', assignment, body, transport);
    if (createErr) return err(createErr);
    return ok(undefined);
}

/**
 * Publish a business catalog locally and wait until SAP reports it published ('p').
 *
 * @param client - ADT client
 * @param name - Business catalog name
 * @param options - Publish timing
 * @returns Publishing status code ('p') or IamPublishError
 */
export async function publishBusinessCatalog(
    client: AdtRequestor,
    name: string,
    options?: IamPublishOptions
): AsyncResult<string, IamPublishError> {
    const catalogName = iamName(name);
    return publishAndWait(client, {
        kind: 'sia1',
        name: catalogName,
        path: PUBLISH_PATH,
        params: { businessCatalogID: catalogName },
        accept: PUBLISH_ACCEPT,
        doneStatuses: [PUBLISHED_STATUS],
    }, options);
}
