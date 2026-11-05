/**
 * Read Object Attributes — title (and, for programs, authorization group) of a source object
 */

import type { AsyncResult } from '../../../types/result';
import { err } from '../../../types/result';
import type { ObjectRef } from '../../../types/requests';
import type { AdtRequestor } from '../types';
import { fetchMetadata } from './fetchMetadata';
import { parseObjectAttributes } from './parseObjectAttributes';
import type { ObjectAttributesInfo } from './types';

export async function readObjectAttributes(client: AdtRequestor, object: ObjectRef): AsyncResult<ObjectAttributesInfo, Error> {
    const [doc, docErr] = await fetchMetadata(client, object);
    if (docErr) return err(docErr);
    return parseObjectAttributes(doc.xml, object);
}
