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
 * Visibility flags of the C1 contract (the two checkboxes in ADT's API State tab).
 */
export interface ApiReleaseVisibility {
    /** "Use in Cloud Development" (ars:useInSAPCloudPlatform). */
    useInCloudDevelopment: boolean;
    /** "Use in Key User Apps" (ars:useInKeyUserApps). */
    useInKeyUserApps: boolean;
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
    /** Current visibility flags (both false while not released). */
    visibility: ApiReleaseVisibility;
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
    /** Resulting visibility flags after the operation. */
    visibility: ApiReleaseVisibility;
    /** False when the object was already in the target state and nothing was sent. */
    changed: boolean;
    /** Non-blocking validation messages surfaced during the operation. */
    messages: ApiReleaseValidationMessage[];
}

/**
 * Result of a visibility update on a released C1 contract.
 */
export interface ApiReleaseVisibilityResult {
    /** Object name (e.g. ZSNAP_F04S_Q01). */
    name: string;
    /** Visibility before the update. */
    previous: ApiReleaseVisibility;
    /** Visibility asked for (current flags with the requested changes applied). */
    requested: ApiReleaseVisibility;
    /** Visibility after the update (equals `previous` unless applied). */
    visibility: ApiReleaseVisibility;
    /** True when the change was applied. */
    changed: boolean;
    /** True when only SAP's validation ran (nothing applied). */
    preview: boolean;
    /** Validation messages (warnings/info), or a note when nothing needed changing. */
    messages: ApiReleaseValidationMessage[];
}
