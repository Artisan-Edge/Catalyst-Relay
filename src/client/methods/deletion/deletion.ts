/**
 * Generic deletion service methods: check, delete by URI, delete an app variant
 */

import type { AsyncResult } from '../../../types/result';
import type { AdtRequestor, DeletionCheckResult, DeletionMessage, DeletionResult } from '../../../core/adt';
import type { ClientState } from '../../types';
import { ok, err } from '../../../types/result';
import * as adt from '../../../core/adt';

export async function checkDeletion(state: ClientState, requestor: AdtRequestor, uris: string[]): AsyncResult<DeletionCheckResult[]> {
    if (!state.session) return err(new Error('Not logged in'));
    return adt.checkDeletion(requestor, uris);
}

export async function deleteByUri(state: ClientState, requestor: AdtRequestor, uris: string[], transport?: string): AsyncResult<DeletionResult[]> {
    if (!state.session) return err(new Error('Not logged in'));
    return adt.deleteByUri(requestor, uris, transport);
}

// App variants (ADVC/LRP) reject LOCK, so they go through the deletion service: check, then delete.
export async function deleteAppVariant(state: ClientState, requestor: AdtRequestor, name: string, transport?: string): AsyncResult<DeletionResult> {
    if (!state.session) return err(new Error('Not logged in'));
    const variant = name.toUpperCase();
    const uri = adt.appVariantUri(variant);

    const [checks, checkErr] = await adt.checkDeletion(requestor, [uri]);
    if (checkErr) return err(checkErr);
    const check = checks[0];
    if (!check) return err(new Error(`Deletion check returned nothing for app variant ${variant}`));
    if (!check.isDeletable) return err(new Error(`App variant ${variant} cannot be deleted${describe(check.messages)}`));
    if (check.recording && !transport) return err(new Error(`App variant ${variant} is in package ${check.packageName}, which records changes; give a transport request`));

    const [results, deleteErr] = await adt.deleteByUri(requestor, [uri], transport);
    if (deleteErr) return err(deleteErr);
    const result = results[0];
    if (!result) return err(new Error(`Deletion returned nothing for app variant ${variant}`));
    if (!result.isDeleted) return err(new Error(`App variant ${variant} was not deleted${describe(result.messages)}`));
    return ok(result);
}

function describe(messages: DeletionMessage[]): string {
    return messages.length > 0 ? `: ${messages.map(message => message.text).join('; ')}` : '';
}
