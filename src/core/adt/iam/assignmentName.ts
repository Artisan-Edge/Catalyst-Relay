/**
 * Assignment Name — <owner>_NNNN names of catalog app assignments (SIA7) and role template catalog assignments (SIA9)
 */

import type { AsyncResult } from '../../../types/result';
import { ok, err } from '../../../types/result';

// Assignments are named <owner>_<NNNN>, numbered from 0001.
const ASSIGNMENT_NUMBER_WIDTH = 4;
/** Longest assignment object name */
export const ASSIGNMENT_NAME_MAX_LENGTH = 30;
/** Longest owner (catalog, role template) name that leaves room for _NNNN */
export const ASSIGNMENT_OWNER_MAX_LENGTH = ASSIGNMENT_NAME_MAX_LENGTH - ASSIGNMENT_NUMBER_WIDTH - 1;
// Names taken by assignments the listing did not show (another session, an unlisted one) are skipped this often.
const MAX_NAME_RETRIES = 3;
const ALREADY_EXISTS = /already exist/i;

/** An assignment made, or found made by someone else meanwhile */
export interface NumberedAssignment {
    assignment: string;
    /** false: another session assigned the same target meanwhile; its assignment is returned */
    created: boolean;
}

/**
 * The next free assignment name, after the highest existing number.
 *
 * @param ownerName - Business catalog or role template name
 * @param existing - Current assignments
 * @returns <owner>_<NNNN>
 */
export function nextAssignmentName<T extends { assignment: string }>(ownerName: string, existing: readonly T[]): string {
    const prefix = `${ownerName.trim().toUpperCase()}_`;
    const numbers = existing
        .map(entry => entry.assignment.toUpperCase())
        .filter(assignment => assignment.startsWith(prefix))
        .map(assignment => Number.parseInt(assignment.slice(prefix.length), 10))
        .filter(number => Number.isFinite(number));
    const next = numbers.length === 0 ? 1 : Math.max(...numbers) + 1;
    return `${prefix}${String(next).padStart(ASSIGNMENT_NUMBER_WIDTH, '0')}`;
}

/**
 * Error when an owner name leaves no room for its assignments' _NNNN suffix, else null.
 *
 * @param label - e.g. 'Business role template'
 * @param ownerName - Owner name
 */
export function assignmentOwnerNameError(label: string, ownerName: string): Error | null {
    const name = ownerName.trim().toUpperCase();
    if (name.length <= ASSIGNMENT_OWNER_MAX_LENGTH) return null;
    return new Error(`${label} ${name} is ${name.length} characters; its assignments are named <name>_NNNN (at most ${ASSIGNMENT_NAME_MAX_LENGTH}), so it can have at most ${ASSIGNMENT_OWNER_MAX_LENGTH}`);
}

/**
 * Create an assignment under the next free name. When SAP says the name already exists, re-list:
 * if the target is assigned by now (another session), return that assignment; else try the next name.
 *
 * @param ownerName - Business catalog or role template name
 * @param existing - Current assignments
 * @param create - Creates the assignment under the given name
 * @param findExisting - Re-lists and returns the target's assignment name, or null when it is not assigned
 * @returns The assignment, or error
 */
export async function createNumberedAssignment<T extends { assignment: string }>(
    ownerName: string,
    existing: readonly T[],
    create: (assignment: string) => AsyncResult<void, Error>,
    findExisting?: () => AsyncResult<string | null, Error>
): AsyncResult<NumberedAssignment, Error> {
    const taken: Array<{ assignment: string }> = [...existing];
    for (let attempt = 0; ; attempt++) {
        const assignment = nextAssignmentName(ownerName, taken);
        if (assignment.length > ASSIGNMENT_NAME_MAX_LENGTH) return err(new Error(`Assignment name ${assignment} is longer than ${ASSIGNMENT_NAME_MAX_LENGTH} characters`));
        const [, createErr] = await create(assignment);
        if (!createErr) return ok({ assignment, created: true });
        if (!ALREADY_EXISTS.test(createErr.message)) return err(createErr);

        if (findExisting) {
            const [found, findErr] = await findExisting();
            if (findErr) return err(new Error(`${createErr.message} (re-listing the assignments failed: ${findErr.message})`));
            if (found) return ok({ assignment: found, created: false });
        }
        if (attempt >= MAX_NAME_RETRIES) return err(createErr);
        taken.push({ assignment });
    }
}
