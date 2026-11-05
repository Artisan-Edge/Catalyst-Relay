/**
 * Read object attributes method (title, program authorization group)
 */

import type { AsyncResult } from '../../../types/result';
import type { ObjectRef } from '../../../types/requests';
import type { AdtRequestor, ObjectAttributesInfo } from '../../../core/adt';
import type { ClientState } from '../../types';
import { err } from '../../../types/result';
import * as adt from '../../../core/adt';

export async function readObjectAttributes(state: ClientState, requestor: AdtRequestor, object: ObjectRef): AsyncResult<ObjectAttributesInfo> {
    if (!state.session) return err(new Error('Not logged in'));
    const [resolved, resolveErr] = await adt.resolveContainers(requestor, [object]);
    if (resolveErr) return err(resolveErr);
    return adt.readObjectAttributes(requestor, resolved[0]!);
}
