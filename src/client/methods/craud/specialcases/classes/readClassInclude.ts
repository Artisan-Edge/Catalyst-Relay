/**
 * Read class include method (GET include source)
 */

import type { AsyncResult } from '../../../../../types/result';
import type { AdtRequestor, ClassIncludeType } from '../../../../../core/adt';
import type { ClientState } from '../../../../types';
import { err } from '../../../../../types/result';
import * as adt from '../../../../../core/adt';

export async function readClassInclude(
    state: ClientState,
    requestor: AdtRequestor,
    className: string,
    includeType: ClassIncludeType
): AsyncResult<string> {
    if (!state.session) return err(new Error('Not logged in'));

    return adt.readClassInclude(requestor, className, includeType);
}
