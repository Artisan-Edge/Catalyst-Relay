/**
 * Create Package — create a development (sub-)package
 *
 * The software component and transport layer default to the super-package's,
 * which is what ADT's New Package wizard proposes for a sub-package.
 */

import type { AsyncResult, Result } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { AdtRequestor } from '../types';
import { escapeXml, safeParseXml } from '../../utils/xml';
import { checkResponse } from '../helpers';

const PACKAGES_PATH = '/sap/bc/adt/packages';
const PACKAGE_CONTENT_TYPE = 'application/vnd.sap.adt.packages.v2+xml';
const PAK_NS = 'http://www.sap.com/adt/packages';
const ADTCORE_NS = 'http://www.sap.com/adt/core';
const NOT_FOUND_STATUS = 404;
const DEFAULT_PACKAGE_TYPE = 'development';

export interface CreatePackageOptions {
    packageName: string;
    /** Super-package the new package sits under */
    parentPackage: string;
    description: string;
    /** Transport request (required unless the package is local) */
    transport?: string;
    /** Software component (default: the parent's) */
    softwareComponent?: string;
    /** Transport layer (default: the parent's) */
    transportLayer?: string;
}

export interface PackageSettings {
    name: string;
    description: string;
    parentPackage: string;
    softwareComponent: string;
    transportLayer: string;
    packageType: string;
}

export interface CreatePackageResult {
    name: string;
    parentPackage: string;
    softwareComponent: string;
    transportLayer: string;
    /** False when the package already existed under the same parent */
    created: boolean;
}

/**
 * Read a package's settings.
 *
 * @param client - ADT client
 * @param packageName - Package name
 * @returns Settings, null when the package does not exist, or error
 */
export async function readPackageSettings(
    client: AdtRequestor,
    packageName: string
): AsyncResult<PackageSettings | null, Error> {
    const [response, requestErr] = await client.request({
        method: 'GET',
        path: `${PACKAGES_PATH}/${encodeURIComponent(packageName.toLowerCase())}`,
        headers: { 'Accept': PACKAGE_CONTENT_TYPE },
    });
    if (!requestErr && response?.status === NOT_FOUND_STATUS) return ok(null);

    const [text, checkErr] = await checkResponse(response, requestErr, `Failed to read package ${packageName}`);
    if (checkErr) return err(checkErr);

    return parsePackageSettings(text, packageName);
}

/**
 * Parse a packages.v2 document.
 *
 * @param xml - Response body
 * @param packageName - Package name (for error messages)
 * @returns Settings or error
 */
export function parsePackageSettings(xml: string, packageName: string): Result<PackageSettings, Error> {
    const [doc, parseErr] = safeParseXml(xml);
    if (parseErr) return err(parseErr);

    const root = doc.documentElement;
    if (!root || root.namespaceURI !== PAK_NS) return err(new Error(`Package ${packageName} response is not a package document`));

    const attribute = (localName: string, attr: string, ns: string): string =>
        root.getElementsByTagNameNS(PAK_NS, localName)[0]?.getAttributeNS(ns, attr) ?? '';

    return ok({
        name: root.getAttributeNS(ADTCORE_NS, 'name') || packageName.toUpperCase(),
        description: root.getAttributeNS(ADTCORE_NS, 'description') ?? '',
        parentPackage: attribute('superPackage', 'name', ADTCORE_NS),
        softwareComponent: attribute('softwareComponent', 'name', PAK_NS),
        transportLayer: attribute('transportLayer', 'name', PAK_NS),
        packageType: attribute('attributes', 'packageType', PAK_NS),
    });
}

/**
 * Create a development package under a super-package.
 *
 * Idempotent: an existing package under the same parent is reported with
 * created: false; under a different parent it is an error.
 *
 * @param client - ADT client
 * @param options - Package options
 * @param username - Responsible user
 * @returns Created package settings or error
 */
export async function createPackage(
    client: AdtRequestor,
    options: CreatePackageOptions,
    username: string
): AsyncResult<CreatePackageResult, Error> {
    const name = options.packageName.toUpperCase();
    const parentName = options.parentPackage.toUpperCase();

    // An existing package is fine only where it was asked for.
    const [existing, existingErr] = await readPackageSettings(client, name);
    if (existingErr) return err(existingErr);
    if (existing) {
        if (existing.parentPackage.toUpperCase() !== parentName) {
            return err(new Error(`Package ${name} already exists under ${existing.parentPackage || 'no super-package'}, not ${parentName}`));
        }
        return ok({ name, parentPackage: parentName, softwareComponent: existing.softwareComponent, transportLayer: existing.transportLayer, created: false });
    }

    // Default software component and transport layer from the parent.
    const [parent, parentErr] = await readPackageSettings(client, parentName);
    if (parentErr) return err(parentErr);
    if (!parent) return err(new Error(`Super-package ${parentName} does not exist`));

    const softwareComponent = (options.softwareComponent ?? parent.softwareComponent).toUpperCase();
    const transportLayer = (options.transportLayer ?? parent.transportLayer).toUpperCase();

    const body = `<?xml version="1.0" encoding="UTF-8"?>
<pak:package xmlns:pak="${PAK_NS}" xmlns:adtcore="${ADTCORE_NS}" adtcore:description="${escapeXml(options.description)}" adtcore:language="EN" adtcore:name="${escapeXml(name)}" adtcore:type="DEVC/K" adtcore:masterLanguage="EN" adtcore:responsible="${escapeXml(username.toUpperCase())}">
  <adtcore:packageRef adtcore:name="${escapeXml(name)}"/>
  <pak:attributes pak:packageType="${DEFAULT_PACKAGE_TYPE}"/>
  <pak:superPackage adtcore:name="${escapeXml(parentName)}"/>
  <pak:applicationComponent/>
  <pak:transport>
    <pak:softwareComponent pak:name="${escapeXml(softwareComponent)}"/>
    <pak:transportLayer pak:name="${escapeXml(transportLayer)}"/>
  </pak:transport>
  <pak:translation/>
  <pak:useAccesses/>
  <pak:packageInterfaces/>
  <pak:subPackages/>
</pak:package>`;

    const params: Record<string, string> = {};
    if (options.transport) params['corrNr'] = options.transport;

    const [response, requestErr] = await client.request({
        method: 'POST',
        path: PACKAGES_PATH,
        params,
        headers: {
            'Content-Type': PACKAGE_CONTENT_TYPE,
            'Accept': PACKAGE_CONTENT_TYPE,
            // A create in the stateful context leaves the new package enqueued for that context, so it
            // cannot be deleted or edited elsewhere until the session ends; a stateless create holds nothing.
            'X-sap-adt-sessiontype': 'stateless',
        },
        body,
    });

    const [, checkErr] = await checkResponse(response, requestErr, `Failed to create package ${name}`);
    if (checkErr) return err(checkErr);

    return ok({ name, parentPackage: parentName, softwareComponent, transportLayer, created: true });
}
