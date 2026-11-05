/**
 * Assignment Name — <owner>_NNNN names of catalog app assignments (SIA7) and role template catalog assignments (SIA9)
 */

import type { AsyncResult } from '../../../types/result';
import { ok, err } from '../../../types/result';

// Assignments are named <owner>_<NNNN>, numbered from 0001.
const ASSIGNMENT_NUMBER_WIDTH = 4;
// Names taken by assignments the listing did not show (another session, an unlisted one) are skipped this often.
const MAX_NAME_RETRIES = 3;
const ALREADY_EXISTS = /already exist/i;

/**
 * The next free assignment name, after the highest existing number.
 *
 * @param ownerName - Business catalog or role template name
 * @param existing - Current assignments
 * @returns <owner>_<NNNN>
 */
export function nextAssignmentName<T extends { assignment: string }>(ownerName: string, existing: readonly T[]): string {
    const prefix = `${ownerName.toUpperCase()}_`;
    const numbers = existing
        .map(entry => entry.assignment.toUpperCase())
        .filter(assignment => assignment.startsWith(prefix))
        .map(assignment => Number.parseInt(assignment.slice(prefix.length), 10))
        .filter(number => Number.isFinite(number));
    const next = numbers.length === 0 ? 1 : Math.max(...numbers) + 1;
    return `${prefix}${String(next).padStart(ASSIGNMENT_NUMBER_WIDTH, '0')}`;
}

/**
 * Create an assignment under the next free name; when SAP says the name already exists, try the next one.
 *
 * @param ownerName - Business catalog or role template name
 * @param existing - Current assignments
 * @param create - Creates the assignment under the given name
 * @returns The name used or error
 */
export async function createNumberedAssignment<T extends { assignment: string }>(
    ownerName: string,
    existing: readonly T[],
    create: (assignment: string) => AsyncResult<void, Error>
): AsyncResult<string, Error> {
    const taken: Array<{ assignment: string }> = [...existing];
    for (let attempt = 0; ; attempt++) {
        const assignment = nextAssignmentName(ownerName, taken);
        const [, createErr] = await create(assignment);
        if (!createErr) return ok(assignment);
        if (!ALREADY_EXISTS.test(createErr.message) || attempt >= MAX_NAME_RETRIES) return err(createErr);
        taken.push({ assignment });
    }
}
