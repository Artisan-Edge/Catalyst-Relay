/**
 * API Release types — shared across the apirelease module
 *
 * Models the C1 release contract of a CDS DDL source (DDLS). SAP exposes a
 * generic API release framework (contracts C0–C4); this module is scoped to
 * the C1 (customer / SAP Cloud Platform) contract on CDS queries.
 */

/**
 * Release status of an API contract.
 *
 * These are the states SAP reports for the C1 contract on a CDS DDL source.
 */
export type ApiReleaseStatus =
    | 'NOT_RELEASED'
    | 'RELEASED'
    | 'DEPRECATED'
    | 'NOT_TO_BE_RELEASED'
    | 'NOT_TO_BE_RELEASED_STABLE';

/**
 * A message returned by the contract validation run (pre-flight check).
 *
 * Warnings (e.g. "referenced data element is not released") are informational
 * and do not block the operation; errors do.
 */
export interface ApiReleaseValidationMessage {
    severity: 'error' | 'warning' | 'info';
    text: string;
    /** SAP message class (e.g. ARS_DEP_CHECKS), if present. */
    msgid?: string;
    /** SAP message number, if present. */
    msgno?: string;
}

/**
 * Current C1 release state of a CDS DDL source.
 */
export interface ApiReleaseState {
    /** Object name (e.g. ZSNAP_F04S_Q01). */
    name: string;
    /** Releasable object ADT URI (e.g. /sap/bc/adt/ddic/ddl/sources/zsnap_f04s_q01). */
    uri: string;
    /** Current C1 contract status. */
    status: ApiReleaseStatus;
    /** Human-readable status description (e.g. "Released"). */
    statusDescription: string;
    /** Convenience flag: true when status is RELEASED. */
    released: boolean;
    /** States the C1 contract can transition to from the current status. */
    allowedTransitions: ApiReleaseStatus[];
    /** User who last changed the C1 contract, if any. */
    changedBy?: string;
    /** Timestamp the C1 contract was last changed, if any. */
    changedAt?: string;
}

/**
 * Result of a release / unrelease operation.
 */
export interface ApiReleaseResult {
    /** Object name (e.g. ZSNAP_F04S_Q01). */
    name: string;
    /** Resulting C1 contract status after the operation. */
    status: ApiReleaseStatus;
    /** Non-blocking validation messages surfaced during the operation. */
    messages: ApiReleaseValidationMessage[];
}
