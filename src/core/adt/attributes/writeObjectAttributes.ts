/**
 * Write Object Attributes — title (and, for programs, authorization group) of a source object
 *
 * Both live in the object's metadata document, not its source: lock the object URI →
 * PUT the edited document → unlock. The change is saved inactive (a class title is
 * stored at once but the class is still marked inactive); activate the object as usual.
 */

import type { AsyncResult } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { ObjectRef } from '../../../types/requests';
import type { AdtRequestor } from '../types';
import { checkResponse } from '../helpers';
import { withLock } from '../craud/withLock';
import { fetchMetadata } from './fetchMetadata';
import { parseObjectAttributes } from './parseObjectAttributes';
import { editMetadata } from './editMetadata';
import { PROGRAM_EXTENSION } from './types';
import type { ObjectAttributes, ObjectAttributesWriteResult } from './types';

const NAMED_ITEM = /<nameditem:name>([^<]*)<\/nameditem:name>/g;

/**
 * Write the given attributes where they differ from SAP's (saved inactive; activate afterwards)
 *
 * @param client - ADT client
 * @param object - Object reference (containers resolved)
 * @param attributes - Attributes to set; omitted ones are left alone
 * @param transport - Transport request (required for non-$TMP packages)
 */
export async function writeObjectAttributes(client: AdtRequestor, object: ObjectRef, attributes: ObjectAttributes, transport?: string): AsyncResult<ObjectAttributesWriteResult, Error> {
    const result: ObjectAttributesWriteResult = { name: object.name, extension: object.extension, changed: [], warnings: [] };
    if (attributes.authorizationGroup !== undefined && object.extension !== PROGRAM_EXTENSION) {
        return err(new Error(`${object.name}.${object.extension}: only programs have an authorization group`));
    }

    const [doc, docErr] = await fetchMetadata(client, object);
    if (docErr) return err(docErr);
    const [current, parseErr] = parseObjectAttributes(doc.xml, object);
    if (parseErr) return err(parseErr);

    const [edit, editErr] = editMetadata(doc.xml, current, attributes);
    if (editErr) return err(editErr);
    if (edit.changed.length === 0) return ok(result);

    if (edit.changed.includes('authorizationGroup') && attributes.authorizationGroup) {
        const known = await isKnownAuthorizationGroup(client, doc.uri, attributes.authorizationGroup);
        if (known === false) result.warnings.push(`Authorization group ${attributes.authorizationGroup.toUpperCase()} is not registered (TPGP); SAP stores it anyway, but authority checks against it need it maintained`);
    }

    const [, putErr] = await withLock(client, { uri: doc.uri, label: object.name }, async lockHandle => {
        const params: Record<string, string> = { lockHandle };
        if (transport) params['corrNr'] = transport;
        const [response, requestErr] = await client.request({ method: 'PUT', path: doc.uri, params, headers: { 'Content-Type': `${doc.contentType}; charset=utf-8` }, body: edit.xml });
        const [, checkErr] = await checkResponse(response, requestErr, `Failed to update the attributes of ${object.name}`);
        if (checkErr) return err(checkErr);
        return ok(undefined);
    });
    if (putErr) return err(putErr);
    return ok({ ...result, changed: edit.changed });
}

// Value help of the program's authorization group (TPGP); null when it can't be read.
async function isKnownAuthorizationGroup(client: AdtRequestor, programUri: string, group: string): Promise<boolean | null> {
    const [response, requestErr] = await client.request({ method: 'GET', path: `${programUri}/valuehelp/authorizationgroup`, params: { name: group.toUpperCase() }, headers: { 'Accept': 'application/*' } });
    if (requestErr || !response.ok) return null;
    const text = await response.text();
    const names = [...text.matchAll(NAMED_ITEM)].map(match => match[1]!.toUpperCase());
    return names.includes(group.toUpperCase());
}
