/**
 * Change Package — reassign objects to another package
 *
 * SAP runs this as a refactoring in two steps: a preview (server validates
 * and resolves the change) followed by an execute. The resulting package is
 * read back afterwards so a silently ignored change is reported as an error.
 *
 * When SAP rejects a move from a transportable package into a local one, the
 * message is extended with a hint: ABAP Cloud refuses such moves with a
 * misleading authorization error.
 */

import type { AsyncResult } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { ObjectRef } from '../../../types/requests';
import type { AdtRequestor, ObjectConfig } from '../types';
import { checkResponse, requireConfig } from '../helpers';
import { getObjectPackage } from '../discovery/objectPackage';
import { getPackageTransportInfo } from '../discovery/packageTransportInfo';
import {
    CHANGE_PACKAGE_REL,
    REFACTORINGS_PATH,
    REFACTORING_HEADERS,
    buildExecuteBody,
    buildObjectUri,
    buildPreviewBody,
} from './helpers';

/**
 * Outcome of a package change for one object.
 * - moved: package changed (verified by reading it back)
 * - preview: server accepted the change; nothing was executed
 * - unchanged: object is already in the target package
 * - error: see message
 */
export type ChangePackageStatus = 'moved' | 'preview' | 'unchanged' | 'error';

/**
 * Result of a package change for one object.
 */
export interface ChangePackageResult {
    name: string;
    extension: string;
    /** Package before the change (empty if it could not be determined). */
    oldPackage: string;
    newPackage: string;
    status: ChangePackageStatus;
    message?: string;
}

/**
 * Options for a package change.
 */
export interface ChangePackageOptions {
    /** Transport request (required when either package is transportable). */
    transport?: string;
    /** Run the preview step only, without changing anything. */
    preview?: boolean;
}

/**
 * Reassign objects to another package.
 *
 * Objects are processed sequentially; a failure on one object does not stop the rest.
 *
 * @param client - ADT client
 * @param objects - Objects to move (name + extension)
 * @param targetPackage - Package to assign the objects to
 * @param options - Transport and preview mode
 * @returns Per-object results, or error for invalid input
 */
export async function changePackage(
    client: AdtRequestor,
    objects: ObjectRef[],
    targetPackage: string,
    options: ChangePackageOptions = {}
): AsyncResult<ChangePackageResult[], Error> {
    const newPackage = targetPackage.trim().toUpperCase();
    if (!newPackage) return err(new Error('Target package is required'));

    // Validate every extension before touching the system.
    const configs: ObjectConfig[] = [];
    for (const obj of objects) {
        const [config, configErr] = requireConfig(obj.extension);
        if (configErr) return err(configErr);
        configs.push(config);
    }

    const results: ChangePackageResult[] = [];
    for (const [i, obj] of objects.entries()) {
        results.push(await changeOne(client, obj, configs[i]!, newPackage, options));
    }
    return ok(results);
}

// Look up the current package → preview → (execute → verify).
async function changeOne(
    client: AdtRequestor,
    obj: ObjectRef,
    config: ObjectConfig,
    newPackage: string,
    options: ChangePackageOptions
): Promise<ChangePackageResult> {
    const name = obj.name.toUpperCase();
    const uri = buildObjectUri(config, obj.name);
    const transport = options.transport ?? '';

    const [oldPackage, pkgErr] = await getObjectPackage(client, uri);
    if (pkgErr) return { name, extension: obj.extension, oldPackage: '', newPackage, status: 'error', message: pkgErr.message };

    const base = { name, extension: obj.extension, oldPackage, newPackage };
    const fail = (message: string): ChangePackageResult => ({ ...base, status: 'error', message });
    const rejected = async (message: string): Promise<ChangePackageResult> => {
        const hint = await describeLocalTarget(client, oldPackage, newPackage);
        return fail(hint ? `${message}. ${hint}` : message);
    };
    if (oldPackage === newPackage) return { ...base, status: 'unchanged' };

    // Step 1: preview (server-side validation of the change).
    const [previewRes, previewReqErr] = await client.request({
        method: 'POST',
        path: REFACTORINGS_PATH,
        params: { step: 'preview', rel: CHANGE_PACKAGE_REL },
        headers: REFACTORING_HEADERS,
        body: buildPreviewBody(config, obj.name, oldPackage, newPackage, transport),
    });
    const [previewText, previewErr] = await checkResponse(previewRes, previewReqErr, `Change package preview failed for ${name}`);
    if (previewErr) return rejected(previewErr.message);
    if (options.preview) return { ...base, status: 'preview' };

    // Step 2: execute with the refactoring the server returned.
    const [executeBody, bodyErr] = buildExecuteBody(previewText, transport);
    if (bodyErr) return fail(bodyErr.message);

    const [executeRes, executeReqErr] = await client.request({
        method: 'POST',
        path: REFACTORINGS_PATH,
        params: { step: 'execute' },
        headers: REFACTORING_HEADERS,
        body: executeBody,
    });
    const [, executeErr] = await checkResponse(executeRes, executeReqErr, `Change package failed for ${name}`);
    if (executeErr) return rejected(executeErr.message);

    // Verify the new assignment.
    const [actual, verifyErr] = await getObjectPackage(client, uri);
    if (verifyErr) return fail(`Change executed but could not be verified: ${verifyErr.message}`);
    if (actual !== newPackage) return fail(`Change executed but object is still in ${actual}`);

    return { ...base, status: 'moved' };
}

// Hint for a transportable-to-local move, or null when it is not one or the packages cannot be read.
async function describeLocalTarget(client: AdtRequestor, oldPackage: string, newPackage: string): Promise<string | null> {
    const [[source], [target]] = await Promise.all([
        getPackageTransportInfo(client, oldPackage),
        getPackageTransportInfo(client, newPackage),
    ]);
    if (!source || !target) return null;
    if (!source.recordChanges || target.recordChanges) return null;
    return `${oldPackage} is transportable (${source.softwareComponent}) and ${newPackage} is local (${target.softwareComponent}); ABAP Cloud systems do not allow moving objects from a transportable package into a local one`;
}
