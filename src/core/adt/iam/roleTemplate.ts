/**
 * Business Role Template (SIA8) and its catalog assignments (SIA9) — create, read, assign and publish
 *
 * Both are blues v1 IAM documents, saved active. The launchpad space of a template is a SIAD
 * source object (.assiad), written through the generic object path.
 */

import type { AsyncResult, Result } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { AdtRequestor } from '../types';
import type { IamPublishOptions, RoleTemplateCatalogAssignment, RoleTemplateInfo } from './types';
import { escapeXml, safeParseXml } from '../../utils/xml';
import { checkResponse } from '../helpers';
import { ADTCORE_NS, IAM_BASE_PATH, createIamDocument, iamDescription, readIamDocument } from './helpers';
import { publishAndWait } from './publish';

const SIA8_NS = 'http://www.sap.com/iam/sia8';
const SIA9_NS = 'http://www.sap.com/iam/sia9';
const ASSIGNMENTS_PATH = `${IAM_BASE_PATH}/sia8/$getsia9`;
const PUBLISH_PATH = `${IAM_BASE_PATH}/sia8/$publish`;
// The publishing media type gets 406 here; the response is sia8.publishing+xml.
const PUBLISH_ACCEPT = '*/*';
// A finished role template publish returns an empty publishingStatusText.
const PUBLISH_DONE_STATUSES = ['p', ''] as const;

/**
 * Create an empty business role template.
 *
 * @param client - ADT client
 * @param name - Role template name (brtID)
 * @param packageName - Target package
 * @param description - Template description
 * @param transport - Transport request
 * @returns void or error
 */
export async function createRoleTemplateObject(
    client: AdtRequestor,
    name: string,
    packageName: string,
    description: string,
    transport?: string
): AsyncResult<void, Error> {
    const templateName = name.toUpperCase();
    const body = `<?xml version="1.0" encoding="UTF-8"?>
<sia8:sia8 xmlns:sia8="${SIA8_NS}" xmlns:adtcore="${ADTCORE_NS}" adtcore:name="${templateName}" adtcore:type="SIA8" adtcore:description="${escapeXml(iamDescription(description || templateName))}" adtcore:language="EN" adtcore:masterLanguage="EN">
  <adtcore:packageRef adtcore:name="${packageName.toUpperCase()}"/>
  <sia8:content>
    <sia8:brtID>${templateName}</sia8:brtID>
    <sia8:scopeDependent>false</sia8:scopeDependent>
  </sia8:content>
</sia8:sia8>`;

    const [, createErr] = await createIamDocument(client, 'sia8', templateName, body, transport);
    if (createErr) return err(createErr);
    return ok(undefined);
}

/**
 * Read a business role template and its catalog assignments.
 *
 * @param client - ADT client
 * @param name - Role template name
 * @returns The template, null when it does not exist, or error
 */
export async function readRoleTemplate(
    client: AdtRequestor,
    name: string
): AsyncResult<RoleTemplateInfo | null, Error> {
    const [xml, readErr] = await readIamDocument(client, 'sia8', name);
    if (readErr) return err(readErr);
    if (xml === null) return ok(null);

    const [template, parseErr] = parseRoleTemplate(xml, name);
    if (parseErr) return err(parseErr);

    const [catalogs, catalogsErr] = await readRoleTemplateCatalogs(client, template.name);
    if (catalogsErr) return err(catalogsErr);
    return ok({ ...template, catalogs });
}

/**
 * Parse a role template blues document (catalogs are read separately).
 *
 * @param xml - Blues XML
 * @param name - Template name (for error messages)
 * @returns The template without its catalogs, or error
 */
export function parseRoleTemplate(xml: string, name: string): Result<RoleTemplateInfo, Error> {
    const [doc, parseErr] = safeParseXml(xml);
    if (parseErr) return err(parseErr);

    const root = doc.documentElement;
    if (!root || root.namespaceURI !== SIA8_NS) return err(new Error(`Business role template ${name} response is not a role template document`));

    const text = (localName: string): string => root.getElementsByTagNameNS(SIA8_NS, localName)[0]?.textContent?.trim() ?? '';
    const packageRef = root.getElementsByTagNameNS(ADTCORE_NS, 'packageRef')[0];
    return ok({
        name: root.getAttributeNS(ADTCORE_NS, 'name') || name.toUpperCase(),
        description: root.getAttributeNS(ADTCORE_NS, 'description') ?? '',
        packageName: packageRef?.getAttributeNS(ADTCORE_NS, 'name') ?? '',
        scopeDependent: text('scopeDependent') === 'true',
        fioriSpaceId: text('fioriSpaceID'),
        catalogs: [],
    });
}

/**
 * List the business catalog assignments (SIA9) of a role template.
 *
 * @param client - ADT client
 * @param name - Role template name
 * @returns Assignments or error
 */
export async function readRoleTemplateCatalogs(
    client: AdtRequestor,
    name: string
): AsyncResult<RoleTemplateCatalogAssignment[], Error> {
    const [response, requestErr] = await client.request({
        method: 'GET',
        path: ASSIGNMENTS_PATH,
        params: { name: name.toUpperCase() },
        headers: { 'Accept': '*/*' },
    });

    const [text, checkErr] = await checkResponse(response, requestErr, `Failed to list the catalogs of business role template ${name}`);
    if (checkErr) return err(checkErr);

    const [doc, parseErr] = safeParseXml(text);
    if (parseErr) return err(parseErr);

    const assignments: RoleTemplateCatalogAssignment[] = [];
    const entries = doc.getElementsByTagNameNS(SIA8_NS, 'businessCatalog');
    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        if (!entry) continue;
        const assignment = entry.getElementsByTagNameNS(SIA8_NS, 'assignmentID')[0]?.textContent?.trim() ?? '';
        const catalog = entry.getElementsByTagNameNS(SIA8_NS, 'businessCatalogID')[0]?.textContent?.trim() ?? '';
        if (assignment && catalog) assignments.push({ assignment, catalog });
    }
    return ok(assignments);
}

/**
 * Assign a business catalog to a role template (creates the SIA9 assignment object).
 *
 * @param client - ADT client
 * @param templateName - Role template name
 * @param catalogName - Business catalog name
 * @param assignmentName - Assignment object name (<template>_<NNNN>)
 * @param packageName - Target package
 * @param transport - Transport request
 * @param description - Assignment description (default: the catalog name)
 * @returns void or error
 */
export async function createRoleTemplateCatalogAssignment(
    client: AdtRequestor,
    templateName: string,
    catalogName: string,
    assignmentName: string,
    packageName: string,
    transport?: string,
    description?: string
): AsyncResult<void, Error> {
    const template = templateName.toUpperCase();
    const catalog = catalogName.toUpperCase();
    const assignment = assignmentName.toUpperCase();

    const body = `<?xml version="1.0" encoding="UTF-8"?>
<sia9:sia9 xmlns:sia9="${SIA9_NS}" xmlns:adtcore="${ADTCORE_NS}" adtcore:name="${assignment}" adtcore:type="SIA9" adtcore:description="${escapeXml(iamDescription(description || catalog))}" adtcore:language="EN" adtcore:masterLanguage="EN">
  <adtcore:packageRef adtcore:name="${packageName.toUpperCase()}"/>
  <sia9:content>
    <sia9:templateCatalogAssignmentID>${assignment}</sia9:templateCatalogAssignmentID>
    <sia9:businessRoleTemplateID>${template}</sia9:businessRoleTemplateID>
    <sia9:businessCatalogID>${catalog}</sia9:businessCatalogID>
  </sia9:content>
</sia9:sia9>`;

    const [, createErr] = await createIamDocument(client, 'sia9', assignment, body, transport);
    if (createErr) return err(createErr);
    return ok(undefined);
}

/**
 * Publish a role template locally and wait for SAP's answer (an empty status means done).
 *
 * @param client - ADT client
 * @param name - Role template name
 * @param options - Publish timing
 * @returns Publishing status text ('' or 'p') or error
 */
export async function publishRoleTemplate(
    client: AdtRequestor,
    name: string,
    options?: IamPublishOptions
): AsyncResult<string, Error> {
    return publishAndWait(client, {
        path: PUBLISH_PATH,
        params: { brtID: name.toUpperCase() },
        accept: PUBLISH_ACCEPT,
        label: `business role template ${name.toUpperCase()}`,
        doneStatuses: PUBLISH_DONE_STATUSES,
    }, options);
}
