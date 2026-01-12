/**
 * VirtualFolders — Fetch folder contents
 */

import type { AsyncResult } from '../../../../types/result';
import { err } from '../../../../types/result';
import type { AdtRequestor } from '../../types';
import { extractError } from '../../../utils/xml';
import type { TreeDiscoveryQuery, ParseResult } from './types';
import { constructTreeBody, parseTreeXml } from './parsers';

/**
 * Fetch virtualfolders contents
 */
export async function fetchVirtualFolders(
    client: AdtRequestor,
    query: TreeDiscoveryQuery,
    owner?: string
): AsyncResult<ParseResult, Error> {
    const body = constructTreeBody(query, '*', owner);
    const [response, requestErr] = await client.request({
        method: 'POST',
        path: '/sap/bc/adt/repository/informationsystem/virtualfolders/contents',
        headers: {
            'Content-Type': 'application/vnd.sap.adt.repository.virtualfolders.request.v1+xml',
            'Accept': 'application/vnd.sap.adt.repository.virtualfolders.result.v1+xml',
        },
        body,
    });

    if (requestErr) return err(requestErr);
    if (!response.ok) {
        const text = await response.text();
        const errorMsg = extractError(text);
        return err(new Error(`Tree discovery failed: ${errorMsg}`));
    }

    const text = await response.text();
    return parseTreeXml(text);
}
