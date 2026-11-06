/**
 * MDA app generator methods: validate, preview, generate
 */

import type { AsyncResult } from '../../../types/result';
import type { AdtRequestor, MdaAppOptions, MdaAppPreview, MdaAppValidation, MdaGenerateResult } from '../../../core/adt';
import type { ClientState } from '../../types';
import { err } from '../../../types/result';
import * as adt from '../../../core/adt';

export async function validateMdaApp(state: ClientState, requestor: AdtRequestor, options: MdaAppOptions): AsyncResult<MdaAppValidation> {
    if (!state.session) return err(new Error('Not logged in'));
    return adt.validateMdaApp(requestor, options);
}

export async function previewMdaApp(state: ClientState, requestor: AdtRequestor, options: MdaAppOptions): AsyncResult<MdaAppPreview> {
    if (!state.session) return err(new Error('Not logged in'));
    return adt.previewMdaApp(requestor, options);
}

export async function generateMdaApp(state: ClientState, requestor: AdtRequestor, options: MdaAppOptions): AsyncResult<MdaGenerateResult> {
    if (!state.session) return err(new Error('Not logged in'));
    return adt.generateMdaApp(requestor, options);
}
