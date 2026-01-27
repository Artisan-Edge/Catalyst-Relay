/**
 * Get package stats method
 */

import type { AsyncResult } from '../../../types/result';
import type { AdtRequestor, PackageNode } from '../../../core/adt';
import type { ClientState } from '../../types';
import { err } from '../../../types/result';
import * as adt from '../../../core/adt';

// Single package overload
export async function getPackageStats(
    state: ClientState,
    requestor: AdtRequestor,
    packageName: string
): AsyncResult<PackageNode>;

// Multiple packages overload
export async function getPackageStats(
    state: ClientState,
    requestor: AdtRequestor,
    packageNames: string[]
): AsyncResult<PackageNode[]>;

// Implementation
export async function getPackageStats(
    state: ClientState,
    requestor: AdtRequestor,
    packageNames: string | string[]
): AsyncResult<PackageNode | PackageNode[]> {
    if (!state.session) return err(new Error('Not logged in'));
    // Type assertion needed because TS can't infer overload from union
    return adt.getPackageStats(requestor, packageNames as string & string[]);
}
