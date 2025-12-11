/**
 * Where-Used — Find object dependencies
 */

import type { Result, AsyncResult } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { ObjectRef } from '../../../types/requests';
import type { AdtRequestor } from '../types';

/**
 * Where-used dependency
 */
export interface Dependency {
    name: string;
    extension: string;
    package: string;
    usageType: string;
}

import { getConfigByType, getConfigByExtension } from '../types';
import { extractError, safeParseXml } from '../../utils/xml';

/**
 * Find where an object is used (dependencies)
 *
 * @param client - ADT client
 * @param object - Object to analyze
 * @returns Array of dependent objects or error
 */
export async function findWhereUsed(
    client: AdtRequestor,
    object: ObjectRef
): AsyncResult<Dependency[], Error> {
    // Validate object extension is supported.
    const config = getConfigByExtension(object.extension);
    if (!config) {
        return err(new Error(`Unsupported extension: ${object.extension}`));
    }

    // Build object URI and request body.
    const uri = `/sap/bc/adt/${config.endpoint}/${object.name}`;
    const body = `<?xml version="1.0" encoding="UTF-8"?>
    <usagereferences:usageReferenceRequest xmlns:usagereferences="http://www.sap.com/adt/ris/usageReferences">
      <usagereferences:affectedObjects/>
    </usagereferences:usageReferenceRequest>`;

    // Execute where-used query.
    const [response, requestErr] = await client.request({
        method: 'POST',
        path: '/sap/bc/adt/repository/informationsystem/usageReferences',
        params: {
            'uri': uri,
            'ris_request_type': 'usageReferences',
        },
        headers: {
            'Content-Type': 'application/vnd.sap.adt.repository.usagereferences.request.v1+xml',
            'Accept': 'application/vnd.sap.adt.repository.usagereferences.result.v1+xml',
        },
        body,
    });

    // Validate successful response.
    if (requestErr) { return err(requestErr); }
    if (!response.ok) {
        const text = await response.text();
        const errorMsg = extractError(text);
        return err(new Error(`Where-used query failed: ${errorMsg}`));
    }

    // Parse dependencies from response.
    const text = await response.text();
    const [dependencies, parseErr] = parseWhereUsed(text);
    if (parseErr) { return err(parseErr); }
    return ok(dependencies);
}

// Parse where-used results from XML.
function parseWhereUsed(xml: string): Result<Dependency[], Error> {
    // Parse XML response.
    const [doc, parseErr] = safeParseXml(xml);
    if (parseErr) { return err(parseErr); }

    // Extract referenced object elements.
    const dependencies: Dependency[] = [];
    const referencedObjects = doc.getElementsByTagNameNS(
        'http://www.sap.com/adt/ris/usageReferences',
        'referencedObject'
    );

    // Process each referenced object.
    for (let i = 0; i < referencedObjects.length; i++) {
        const refObj = referencedObjects[i];
        if (!refObj) continue;

        // Extract ADT object element.
        const adtObject = refObj.getElementsByTagNameNS(
            'http://www.sap.com/adt/ris/usageReferences',
            'adtObject'
        )[0];
        if (!adtObject) continue;

        // Extract object name and type.
        const name = adtObject.getAttributeNS('http://www.sap.com/adt/core', 'name') || adtObject.getAttribute('adtcore:name');
        const type = adtObject.getAttributeNS('http://www.sap.com/adt/core', 'type') || adtObject.getAttribute('adtcore:type');
        if (!name || !type) continue;

        // Look up object type configuration.
        const config = getConfigByType(type);
        if (!config) continue;

        // Extract package reference if available.
        const packageRef = adtObject.getElementsByTagNameNS('http://www.sap.com/adt/core', 'packageRef')[0];
        const packageName = packageRef
            ? (packageRef.getAttributeNS('http://www.sap.com/adt/core', 'name') || packageRef.getAttribute('adtcore:name'))
            : '';

        // Build dependency object.
        dependencies.push({
            name,
            extension: config.extension,
            package: packageName || '',
            usageType: 'reference',
        });
    }

    return ok(dependencies);
}
