/**
 * Require AFF JSON Paths — check a source sets the paths its type needs before it is sent
 */

import type { Result } from '../../../types/result';
import { ok, err } from '../../../types/result';
import { safeJsonParse } from '../../utils/json';
import type { AffJsonRules } from '../types';

/**
 * Error when a source is empty, not a JSON object, or lacks an AffJsonRules.requiredPaths path
 * (dot paths, no arrays); ok otherwise. Types without rules are not checked.
 *
 * @param content - AFF JSON source
 * @param rules - The type's rules, e.g. getConfigByExtension(ext)?.affJson
 * @param subject - "<Label> <NAME>" for the message
 */
export function requireAffJsonPaths(content: string, rules: AffJsonRules | undefined, subject: string): Result<void, Error> {
    if (!rules) return ok(undefined);

    const [parsed, parseErr] = safeJsonParse(content);
    if (parseErr || !isRecord(parsed) || Object.keys(parsed).length === 0) {
        return err(new Error(`${subject}: the source is empty or not a JSON object`));
    }

    const missing = (rules.requiredPaths ?? []).filter(path => !hasPath(parsed, path.split('.')));
    if (missing.length === 0) return ok(undefined);
    return err(new Error(`${subject}: ${missing.join(' and ')} ${missing.length === 1 ? 'is' : 'are'} required (SAP fails the save without ${missing.length === 1 ? 'it' : 'them'})`));
}

function hasPath(value: Record<string, unknown>, segments: string[]): boolean {
    const [key, ...rest] = segments;
    if (key === undefined || !(key in value)) return false;
    if (rest.length === 0) return true;
    const next = value[key];
    return isRecord(next) && hasPath(next, rest);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
