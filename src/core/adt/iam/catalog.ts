/**
 * Business Catalog (SIA1) and its app assignments (SIA7) — create, read, assign and publish
 */

import type { AsyncResult, Result } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { AdtRequestor } from '../types';
import type { BusinessCatalogInfo, CatalogAppAssignment } from './types';
import { escapeXml, safeParseXml } from '../../utils/xml';
import { checkResponse } from '../helpers';
import { ADTCORE_NS, IAM_BASE_PATH, createIamDocument, isPublished, readIamDocument, submitIamPublish } from './helpers';

const SIA1_NS = 'http://www.sap.com/iam/sia1';
const SIA7_NS = 'http://www.sap.com/iam/sia7';
const ASSIGNMENTS_PATH = `${IAM_BASE_PATH}/sia1/$bucapps`;
const PUBLISH_PATH = `${IAM_BASE_PATH}/sia1/$publish`;
// Assignments are named <catalog>_<NNNN>, numbered from 0001.
const ASSIGNMENT_NUMBER_WIDTH = 4;

/**
 * Create an empty business catalog.
 *
 * @param client - ADT client
 * @param name - Business catalog name
 * @param packageName - Target package
 * @param description - Catalog description
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
    const catalogName = name.toUpperCase();
    const body = `<?xml version="1.0" encoding="UTF-8"?>
<sia1:sia1 xmlns:sia1="${SIA1_NS}" xmlns:adtcore="${ADTCORE_NS}" adtcore:description="${escapeXml(description)}" adtcore:language="EN" adtcore:name="${catalogName}" adtcore:type="SIA1" adtcore:masterLanguage="EN">
  <adtcore:packageRef adtcore:name="${packageName.toUpperCase()}"/>
  <sia1:content>
    <sia1:businessCatalogID>${catalogName}</sia1:businessCatalogID>
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
    const [xml, readErr] = await readIamDocument(client, 'sia1', name);
    if (readErr) return err(readErr);
    if (xml === null) return ok(null);

    const [catalog, parseErr] = parseBusinessCatalog(xml, name);
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
 * @returns Assignments or error
 */
export async function readCatalogAssignments(
    client: AdtRequestor,
    name: string
): AsyncResult<CatalogAppAssignment[], Error> {
    const [response, requestErr] = await client.request({
        method: 'GET',
        path: ASSIGNMENTS_PATH,
        params: { name: name.toUpperCase() },
    });

    const [text, checkErr] = await checkResponse(response, requestErr, `Failed to list the apps of business catalog ${name}`);
    if (checkErr) return err(checkErr);

    const [doc, parseErr] = safeParseXml(text);
    if (parseErr) return err(parseErr);

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
 * @returns void or error
 */
export async function createCatalogAssignment(
    client: AdtRequestor,
    catalogName: string,
    appName: string,
    assignmentName: string,
    packageName: string,
    transport?: string
): AsyncResult<void, Error> {
    const catalog = catalogName.toUpperCase();
    const app = appName.toUpperCase();
    const assignment = assignmentName.toUpperCase();
    // SAP rejects an assignment without a description.
    const description = `${app} in ${catalog}`;

    const body = `<?xml version="1.0" encoding="UTF-8"?>
<sia7:sia7 xmlns:sia7="${SIA7_NS}" xmlns:adtcore="${ADTCORE_NS}" adtcore:description="${escapeXml(description)}" adtcore:language="EN" adtcore:name="${assignment}" adtcore:type="SIA7" adtcore:masterLanguage="EN">
  <adtcore:packageRef adtcore:name="${packageName.toUpperCase()}"/>
  <sia7:content>
    <sia7:businessCatalogAppAssignmentID>${assignment}</sia7:businessCatalogAppAssignmentID>
    <sia7:businessCatalogID>${catalog}</sia7:businessCatalogID>
    <sia7:appID>${app}</sia7:appID>
  </sia7:content>
</sia7:sia7>`;

    const [, createErr] = await createIamDocument(client, 'sia7', assignment, body, transport);
    if (createErr) return err(createErr);
    return ok(undefined);
}

/**
 * The next free assignment name of a catalog, after the highest existing number.
 *
 * @param catalogName - Business catalog name
 * @param existing - Current assignments
 * @returns <catalog>_<NNNN>
 */
export function nextAssignmentName(catalogName: string, existing: CatalogAppAssignment[]): string {
    const catalog = catalogName.toUpperCase();
    const prefix = `${catalog}_`;
    const numbers = existing
        .map(entry => entry.assignment.toUpperCase())
        .filter(assignment => assignment.startsWith(prefix))
        .map(assignment => Number.parseInt(assignment.slice(prefix.length), 10))
        .filter(number => Number.isFinite(number));
    const next = numbers.length === 0 ? 1 : Math.max(...numbers) + 1;
    return `${prefix}${String(next).padStart(ASSIGNMENT_NUMBER_WIDTH, '0')}`;
}

/**
 * Publish a business catalog locally.
 *
 * @param client - ADT client
 * @param name - Business catalog name
 * @returns Publishing status code ('p' when published) or error
 */
export async function publishBusinessCatalog(
    client: AdtRequestor,
    name: string
): AsyncResult<string, Error> {
    return submitIamPublish(client, PUBLISH_PATH, { businessCatalogID: name.toUpperCase() }, `business catalog ${name}`);
}
