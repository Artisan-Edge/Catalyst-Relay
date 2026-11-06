/**
 * Publish timing within an overall deadline of a create call (internal)
 */

import type { IamPublishOptions } from '../../../core/adt';

// The publish wait gets what is left of the call's deadline; without one it keeps its own defaults.
export function publishOptionsWithin(startedAt: number, deadlineMs: number | undefined): IamPublishOptions | undefined {
    if (deadlineMs === undefined) return undefined;
    return { deadlineMs: Math.max(0, startedAt + deadlineMs - Date.now()) };
}
