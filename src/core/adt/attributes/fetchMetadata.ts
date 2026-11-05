/**
 * Fetch Metadata — GET an object's metadata document (the newest version SAP serves)
 */

import type { AsyncResult } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { ObjectRef } from '../../../types/requests';
import type { AdtRequestor } from '../types';
import { checkResponse, objectUri, requireConfig } from '../helpers';
import { ATTRIBUTE_EXTENSIONS } from './types';
import type { MetadataDocument } from './types';

export async function fetchMetadata(client: AdtRequestor, object: ObjectRef): AsyncResult<MetadataDocument, Error> {
    const [config, configErr] = requireConfig(object.extension);
    if (configErr) return err(configErr);
    if (!config.hasAttributes) return err(new Error(`Attributes are not supported for .${object.extension} (supported: ${ATTRIBUTE_EXTENSIONS.join(', ')})`));
    const [uri, uriErr] = objectUri(config, object);
    if (uriErr) return err(uriErr);

    // The newest document version is served for application/*; it is PUT back with the same media type.
    const [response, requestErr] = await client.request({ method: 'GET', path: uri, headers: { 'Accept': 'application/*' } });
    const contentType = response?.headers.get('content-type') ?? '';
    const [xml, checkErr] = await checkResponse(response, requestErr, `Failed to read ${config.label} ${object.name}`);
    if (checkErr) return err(checkErr);
    return ok({ uri, xml, contentType: contentType.split(';')[0]!.trim() });
}
