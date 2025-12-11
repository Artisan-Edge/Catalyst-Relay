/**
 * Git Diff — Compare local content with server content
 *
 * Uses Myers diff algorithm to compute line-by-line differences.
 */

import { diffArrays, type ChangeObject } from 'diff';
import type { AsyncResult } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { AdtRequestor } from '../types';
import type { ObjectContent } from '../../../types/requests';
import { readObject } from './read';
import { getConfigByExtension } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Types (colocated - only used by this function)
// ─────────────────────────────────────────────────────────────────────────────

/** Base fields for all diff hunks */
interface BaseDiffHunk {
    /** Total number of lines in the hunk */
    length: number;
    /** Starting line in the diff output (0-indexed) */
    diffStart: number;
    /** Starting line in the local file (0-indexed) */
    localStart: number;
}

/** Addition or deletion hunk */
export interface SimpleDiffHunk extends BaseDiffHunk {
    type: 'addition' | 'deletion';
    /** Lines added or removed */
    changes: string[];
}

/** Modification hunk (deletion immediately followed by addition) */
export interface ModifiedDiffHunk extends BaseDiffHunk {
    type: 'modification';
    /** Tuple of [server_lines, local_lines] */
    changes: [string[], string[]];
}

/** Any diff hunk */
export type DiffHunk = SimpleDiffHunk | ModifiedDiffHunk;

/** Result of comparing a single object */
export interface DiffResult {
    name: string;
    extension: string;
    label: string;
    diffs: DiffHunk[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Implementation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute diff between server and local content
 *
 * Converts jsdiff ChangeObject[] output to the hunk format matching Python behavior.
 */
function computeDiff(serverLines: string[], localLines: string[]): DiffHunk[] {
    const changes = diffArrays(serverLines, localLines);
    const hunks: DiffHunk[] = [];

    let diffIndex = 0;
    let localIndex = 0;

    for (let i = 0; i < changes.length; i++) {
        const change = changes[i] as ChangeObject<string[]>;
        if (!change) continue;

        if (!change.added && !change.removed) {
            // Unchanged lines - advance both indices
            const count = change.count ?? change.value.length;
            diffIndex += count;
            localIndex += count;
            continue;
        }

        if (change.removed) {
            // Check if next change is an addition (making this a modification)
            const nextChange = changes[i + 1] as ChangeObject<string[]> | undefined;

            if (nextChange?.added) {
                // Modification: deletion followed by addition
                const serverChanges = change.value;
                const localChanges = nextChange.value;
                const modHunk: ModifiedDiffHunk = {
                    type: 'modification',
                    length: serverChanges.length + localChanges.length,
                    diffStart: diffIndex,
                    localStart: localIndex,
                    changes: [serverChanges, localChanges],
                };
                hunks.push(modHunk);

                // Advance indices and skip the next addition
                diffIndex += serverChanges.length + localChanges.length;
                localIndex += localChanges.length;
                i++; // Skip the addition we just processed
                continue;
            }

            // Pure deletion
            const deletionHunk: SimpleDiffHunk = {
                type: 'deletion',
                length: change.value.length,
                diffStart: diffIndex,
                localStart: localIndex,
                changes: change.value,
            };
            hunks.push(deletionHunk);
            diffIndex += change.value.length;
            continue;
        }

        if (!change.added) continue;

        // Pure addition (not preceded by deletion - handled above)
        const additionHunk: SimpleDiffHunk = {
            type: 'addition',
            length: change.value.length,
            diffStart: diffIndex,
            localStart: localIndex,
            changes: change.value,
        };
        hunks.push(additionHunk);
        diffIndex += change.value.length;
        localIndex += change.value.length;
    }

    return hunks;
}

/**
 * Compare local object content with server content
 *
 * @param client - ADT client
 * @param object - Object with local content to compare
 * @returns Diff result or error
 */
export async function gitDiff(
    client: AdtRequestor,
    object: ObjectContent
): AsyncResult<DiffResult, Error> {
    // Read current server content.
    const [serverObj, readErr] = await readObject(client, {
        name: object.name,
        extension: object.extension,
    });

    if (readErr) {
        return err(new Error(`${object.name} does not exist on server`));
    }

    // Get label from config.
    const config = getConfigByExtension(object.extension);
    const label = config?.label ?? object.extension;

    // Split content into lines for comparison.
    const serverLines = serverObj.content.split('\n');
    const localLines = object.content.split('\n');

    // Compute diff.
    const diffs = computeDiff(serverLines, localLines);

    return ok({
        name: serverObj.name,
        extension: serverObj.extension,
        label,
        diffs,
    });
}
