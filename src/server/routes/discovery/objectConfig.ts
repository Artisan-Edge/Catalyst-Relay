/**
 * GET /object-config — List supported object types
 */

import { OBJECT_CONFIG_MAP } from '../../../core/adt/types';
import type { ObjectConfig } from '../../../core/adt/types';
import type { Context } from 'hono';

// ─────────────────────────────────────────────────────────────────────────────
// Response Type (colocated)
// ─────────────────────────────────────────────────────────────────────────────

export type ObjectConfigResponse = ObjectConfig[];

// ─────────────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────────────

export function objectConfigHandler(c: Context) {
    const configs = Object.values(OBJECT_CONFIG_MAP);

    return c.json({
        success: true,
        data: configs satisfies ObjectConfigResponse,
    });
}
