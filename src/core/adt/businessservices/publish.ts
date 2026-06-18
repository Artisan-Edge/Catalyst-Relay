/**
 * Publish — lock and publish a service binding (exposes the OData service)
 */

import type { AsyncResult } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { AdtRequestor } from '../types';
import { extractLockHandle, extractTagText } from '../../utils/xml';
import { checkResponse } from '../helpers';
import { debug } from '../../utils/logging';

const LOCK_ACCEPT_HEADER =
    'application/*,application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.result';
const SEVERITY_OK = 'OK';

/**
 * Publish a service binding.
 *
 * Locks the binding, then submits an OData V4 publish job. Publishing exposes the
 * binding's entity sets at the OData service URL.
 *
 * @param client - ADT client
 * @param bindingName - Service binding name
 * @returns Publish message (SHORT_TEXT) or error
 */
export async function publishServiceBinding(
    client: AdtRequestor,
    bindingName: string
): AsyncResult<string, Error> {
    const bindingPath = `/sap/bc/adt/businessservices/bindings/${bindingName.toLowerCase()}`;

    // Lock the binding before publishing.
    const [lockResponse, lockRequestErr] = await client.request({
        method: 'POST',
        path: bindingPath,
        params: {
            '_action': 'LOCK',
            'accessMode': 'MODIFY',
        },
        headers: { 'Accept': LOCK_ACCEPT_HEADER },
    });
    const [lockText, lockCheckErr] = await checkResponse(
        lockResponse,
        lockRequestErr,
        `Failed to lock service binding ${bindingName}`
    );
    if (lockCheckErr) return err(lockCheckErr);

    const [lockHandle, extractErr] = extractLockHandle(lockText);
    if (extractErr) return err(new Error(`Failed to extract lock handle: ${extractErr.message}`));
    debug(`Service binding lock acquired: handle=${lockHandle}`);

    // Submit the publish job.
    const publishBody = `<?xml version="1.0" encoding="UTF-8"?>
<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">
  <adtcore:objectReference adtcore:type="SCGR" adtcore:name="${bindingName.toUpperCase()}"/>
</adtcore:objectReferences>`;

    const [publishResponse, publishRequestErr] = await client.request({
        method: 'POST',
        path: '/sap/bc/adt/businessservices/odatav4/publishjobs',
        headers: { 'Content-Type': 'application/xml' },
        body: publishBody,
    });
    const [publishText, publishCheckErr] = await checkResponse(
        publishResponse,
        publishRequestErr,
        `Failed to publish service binding ${bindingName}`
    );
    if (publishCheckErr) return err(publishCheckErr);

    // Surface non-OK severities as errors.
    const severity = extractTagText(publishText, 'SEVERITY');
    if (severity && severity !== SEVERITY_OK) {
        const shortText = extractTagText(publishText, 'SHORT_TEXT') ?? '';
        return err(new Error(`Service binding publish failed (${severity}): ${shortText}`));
    }

    return ok(extractTagText(publishText, 'SHORT_TEXT') ?? '');
}
