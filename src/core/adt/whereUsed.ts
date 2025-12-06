/**
 * Where-Used — Find object dependencies
 */

import { DOMParser } from '@xmldom/xmldom';
import type { AsyncResult } from '../../types/result';
import { ok, err } from '../../types/result';
import type { ObjectRef } from '../../types/requests';
import type { Dependency } from '../../types/responses';
import type { AdtRequestor } from './types';
import { getConfigByType, getConfigByExtension } from './types';
import { extractError } from '../utils/xml';

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
    const config = getConfigByExtension(object.extension);
    if (!config) {
        return err(new Error(`Unsupported extension: ${object.extension}`));
    }

    const uri = `/sap/bc/adt/${config.endpoint}/${object.name}`;

    const body = `<?xml version="1.0" encoding="UTF-8"?>
    <usagereferences:usageReferenceRequest xmlns:usagereferences="http://www.sap.com/adt/ris/usageReferences">
      <usagereferences:affectedObjects/>
    </usagereferences:usageReferenceRequest>`;

    const [response, requestErr] = await client.request({
        method: 'POST',
        path: '/sap/bc/adt/repository/informationsystem/usageReferences',
        params: {
            'uri': uri,
        },
        headers: {
            'Content-Type': 'application/vnd.sap.adt.repository.usagereferences.request.v1+xml',
            'Accept': 'application/vnd.sap.adt.repository.usagereferences.result.v1+xml',
        },
        body,
    });

    if (requestErr) {
        return err(requestErr);
    }

    if (!response.ok) {
        const text = await response.text();
        const errorMsg = extractError(text);
        return err(new Error(`Where-used query failed: ${errorMsg}`));
    }

    const text = await response.text();
    const [dependencies, parseErr] = parseWhereUsed(text);
    if (parseErr) {
        return err(parseErr);
    }

    return ok(dependencies);
}

/**
 * Parse where-used results from XML
 */
function parseWhereUsed(xml: string): [Dependency[], null] | [null, Error] {
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(xml, 'text/xml');

        const dependencies: Dependency[] = [];
        const referencedObjects = doc.getElementsByTagNameNS(
            'http://www.sap.com/adt/ris/usageReferences',
            'referencedObject'
        );

        for (let i = 0; i < referencedObjects.length; i++) {
            const refObj = referencedObjects[i];
            if (!refObj) continue;

            const adtObject = refObj.getElementsByTagNameNS(
                'http://www.sap.com/adt/ris/usageReferences',
                'adtObject'
            )[0];

            if (!adtObject) {
                continue;
            }

            const name = adtObject.getAttributeNS('http://www.sap.com/adt/core', 'name') || adtObject.getAttribute('adtcore:name');
            const type = adtObject.getAttributeNS('http://www.sap.com/adt/core', 'type') || adtObject.getAttribute('adtcore:type');

            if (!name || !type) {
                continue;
            }

            const config = getConfigByType(type);
            if (!config) {
                continue;
            }

            const packageRef = adtObject.getElementsByTagNameNS('http://www.sap.com/adt/core', 'packageRef')[0];
            const packageName = packageRef
                ? (packageRef.getAttributeNS('http://www.sap.com/adt/core', 'name') || packageRef.getAttribute('adtcore:name'))
                : '';

            dependencies.push({
                name,
                extension: config.extension,
                package: packageName || '',
                usageType: 'reference',
            });
        }

        return [dependencies, null];
    } catch (error) {
        if (error instanceof Error) {
            return [null, error];
        }
        return [null, new Error('Failed to parse where-used results')];
    }
}
