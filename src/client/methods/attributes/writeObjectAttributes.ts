/**
 * Write object attributes method (title, program authorization group)
 */

import type { AsyncResult } from '../../../types/result';
import type { ObjectRef } from '../../../types/requests';
import type { AdtRequestor, ObjectAttributes, ObjectAttributesWriteResult } from '../../../core/adt';
import type { ClientState } from '../../types';
import { err } from '../../../types/result';
import * as adt from '../../../core/adt';

export async function writeObjectAttributes(state: ClientState, requestor: AdtRequestor, object: ObjectRef, attributes: ObjectAttributes, transport?: string): AsyncResult<ObjectAttributesWriteResult> {
    if (!state.session) return err(new Error('Not logged in'));
    const [resolved, resolveErr] = await adt.resolveContainers(requestor, [object]);
    if (resolveErr) return err(resolveErr);
    return adt.writeObjectAttributes(requestor, resolved[0]!, attributes, transport);
}
