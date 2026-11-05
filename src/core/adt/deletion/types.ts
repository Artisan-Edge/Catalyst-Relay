// ADT deletion service types (/sap/bc/adt/deletion/check|delete)

/** A message the deletion service returns per object */
export interface DeletionMessage {
    /** S, I, W, E */
    type: string;
    text: string;
}

/** Deletion check of one object */
export interface DeletionCheckResult {
    uri: string;
    name: string;
    /** ADT type, e.g. ADVC/LRP */
    type: string;
    packageName: string;
    isDeletable: boolean;
    externalStrongReferences: number;
    externalWeakReferences: number;
    /** Whether the package records changes (a transport is then needed) */
    recording: boolean;
    /** Transport that locks the object ('' when none) */
    lockingTransport: string;
    messages: DeletionMessage[];
}

/** Deletion of one object */
export interface DeletionResult {
    uri: string;
    name: string;
    type: string;
    packageName: string;
    isDeleted: boolean;
    messages: DeletionMessage[];
}
