/**
 * Lock Object Types — model for .asenqu (SE11 lock object, ENQU) definitions
 */

/** Lock modes a lock object table can declare: write (E), read/shared (S), exclusive not cumulative (X) */
export const LOCK_MODES = ['E', 'S', 'X'] as const;
export type LockMode = typeof LOCK_MODES[number];

export interface LockTableDef {
    table: string;
    lockMode: LockMode;
}

export interface LockParameterDef {
    /** Parameter of ENQUEUE_/DEQUEUE_ (usually the field name) */
    name: string;
    table: string;
    field: string;
    /** false: the parameter exists but is not offered by the lock modules ("not wanted") */
    wanted: boolean;
}

export interface LockObjectDef {
    name: string;
    description: string;
    allowRfc: boolean;
    primary: LockTableDef;
    secondary: LockTableDef[];
    parameters: LockParameterDef[];
}

// SAP limits: DD25L-VIEWNAME (lock object name), DD25T-DDTEXT (description).
export const MAX_NAME_LENGTH = 16;
export const MAX_DESCRIPTION_LENGTH = 60;
