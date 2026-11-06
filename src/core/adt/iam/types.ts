// Cloud IAM types — IAM apps (SIA6), business catalogs (SIA1) and their app assignments (SIA7),
// business role templates (SIA8) and their catalog assignments (SIA9)

import type { IamPublishError } from './publish';

/** Service types an IAM app can list: OData V4 (G4BA service group), OData V2 (IWSV service) or InA (INA1, an InA service binding). */
export type IamServiceType = 'G4BA' | 'IWSV' | 'INA1';

/** IAM object kinds, named by their ADT collection segment */
export type IamObjectKind = 'sia1' | 'sia6' | 'sia7' | 'sia8' | 'sia9';

/** A service to put on an IAM app's Services tab */
export interface IamServiceRef {
    /** Service binding name (V4, InA) or V2 technical service name */
    name: string;
    type: IamServiceType;
    /** IWSV service version (default '0001'); ignored for G4BA and INA1 */
    version?: string;
}

/** A service as listed on an IAM app */
export interface IamAppService {
    /** relServiceName without its version — the binding (V4, InA) or service (V2) name */
    name: string;
    /** The version SAP pads an IWSV relServiceName with (e.g. '0001'); '' for other types */
    version: string;
    /** relServiceType — G4BA, IWSV, INA1, ... */
    type: string;
    /** typeText, e.g. 'OData V4' */
    typeText: string;
    description: string;
    /** srvcType + srvcName — the runtime service key SAP derives */
    runtimeType: string;
    runtimeName: string;
}

/** Publish state of an IAM app or business catalog: 'p' published, 'u' unpublished, '' unknown. */
export type IamPublishStatus = string;

export interface IamAppInfo {
    name: string;
    description: string;
    packageName: string;
    /** EXT (External App), IBS (inbound service), ... */
    appType: string;
    /** UI5 app (launchpad app descriptor item) the app grants; '' when none */
    ui5AppId: string;
    services: IamAppService[];
    /** Not proof of a publish: a new app reads 'p' before it was ever published */
    publishStatus: IamPublishStatus;
    /** '3' once migrated (2608); '' on apps a catalog assignment refuses; null when the document has no such element */
    migrationStatus: string | null;
}

export interface CreateIamAppOptions {
    appName: string;
    /** An existing app in another package is refused */
    packageName: string;
    /** Set on create only (cut to 60 characters); an existing app keeps its description */
    description: string;
    transport?: string;
    /** Application type (default 'EXT', External App) */
    appType?: string;
    services: IamServiceRef[];
    /** UI5 app ID to set (single value; a different existing one is replaced) */
    ui5AppId?: string;
    /** Publish locally after saving (default: true) */
    publish?: boolean;
    /** Overall time limit of the call; the publish wait gets what is left (default: the publish's own 10 min) */
    deadlineMs?: number;
}

export type IamStepStatus = 'DONE' | 'SKIPPED';

/** Fields every IAM create result shares */
export interface IamCreateOutcome {
    created: boolean;
    /** Anything was written (create, services, ui5AppId, migration, assignments); a publish alone is no change */
    changed: boolean;
    /** Always false: the description is set on create only */
    descriptionUpdated: false;
    /** An existing object's description differs from the one asked for (not changed) */
    descriptionDiffers: boolean;
    /** The publish failed or did not finish after everything else was saved; the rest of the result stands */
    publishError?: IamPublishError;
}

export interface IamAppResult extends IamCreateOutcome {
    name: string;
    /** Services newly added to the app (names); already-listed services are skipped */
    servicesAdded: string[];
    /** The app's UI5 app ID after the run ('' when none) */
    ui5AppId: string;
    /** The UI5 app ID this run replaced; null when none was replaced (unchanged, or set where there was none) */
    ui5AppIdReplaced: string | null;
    /** migrationStatus was empty and was set to 3 */
    migrated: boolean;
    published: boolean;
    publishStatus: IamPublishStatus;
    steps: { create: IamStepStatus; services: IamStepStatus; ui5AppId: IamStepStatus; migration: IamStepStatus; publish: IamStepStatus };
}

/** One IAM app assigned to a business catalog */
export interface CatalogAppAssignment {
    /** SIA7 object name, <catalog>_<NNNN> */
    assignment: string;
    app: string;
}

export interface BusinessCatalogInfo {
    name: string;
    description: string;
    packageName: string;
    apps: CatalogAppAssignment[];
    publishStatus: IamPublishStatus;
    published: boolean;
}

export interface CreateBusinessCatalogOptions {
    catalogName: string;
    /** An existing catalog in another package is refused */
    packageName: string;
    /** Set on create only (cut to 60 characters) */
    description: string;
    transport?: string;
    /** IAM apps to assign */
    apps: string[];
    /** Publish locally after assigning (default: true) */
    publish?: boolean;
    /** Overall time limit of the call; the publish wait gets what is left */
    deadlineMs?: number;
}

export interface BusinessCatalogResult extends IamCreateOutcome {
    name: string;
    /** Assignments newly created; apps already in the catalog are skipped */
    assignmentsAdded: CatalogAppAssignment[];
    /** Assignments another session made meanwhile (found after SAP said the name exists) */
    assignmentsFound: CatalogAppAssignment[];
    /** Customer EXT apps whose empty migrationStatus was set to 3 before assigning them */
    appsMigrated: string[];
    published: boolean;
    publishStatus: IamPublishStatus;
    steps: { create: IamStepStatus; assign: IamStepStatus; publish: IamStepStatus };
}

/** One business catalog assigned to a business role template */
export interface RoleTemplateCatalogAssignment {
    /** SIA9 object name, <template>_<NNNN> */
    assignment: string;
    catalog: string;
}

export interface RoleTemplateInfo {
    name: string;
    description: string;
    packageName: string;
    scopeDependent: boolean;
    /** sia8:fioriSpaceID; usually '' (the space is linked through a SIAD, .assiad) */
    fioriSpaceId: string;
    catalogs: RoleTemplateCatalogAssignment[];
}

export interface CreateRoleTemplateOptions {
    /** At most 25 characters when catalogs are assigned (assignments are <name>_NNNN, at most 30) */
    templateName: string;
    /** An existing template in another package is refused */
    packageName: string;
    /** Set on create only (cut to 60 characters) */
    description: string;
    transport?: string;
    /** Business catalogs to assign */
    catalogs: string[];
    /** Publish locally after assigning (default: true; always runs, nothing reads back a publish) */
    publish?: boolean;
    /** Overall time limit of the call; the publish wait gets what is left */
    deadlineMs?: number;
}

export interface RoleTemplateResult extends IamCreateOutcome {
    name: string;
    /** Assignments newly created; catalogs already assigned are skipped */
    assignmentsAdded: RoleTemplateCatalogAssignment[];
    /** Assignments another session made meanwhile (found after SAP said the name exists) */
    assignmentsFound: RoleTemplateCatalogAssignment[];
    published: boolean;
    /** publishingStatusText; SAP returns '' for a finished role template publish */
    publishStatus: IamPublishStatus;
    steps: { create: IamStepStatus; assign: IamStepStatus; publish: IamStepStatus };
}

/** Timing of a synchronous "Publish Locally" call (defaults suit SAP's ~2 min publish) */
export interface IamPublishOptions {
    /** Per-request timeout (default 300 s) */
    requestTimeoutMs?: number;
    /** Wait before re-posting after 'u' or a 502/504 / dropped connection (default 30 s) */
    retryDelayMs?: number;
    /** Overall limit across re-posts (default 10 min) */
    deadlineMs?: number;
    /** No POST starts with less time than this left before the deadline (default 150 s) */
    minPostWindowMs?: number;
    /** Least gap between attempts (default 3 s) */
    minAttemptDelayMs?: number;
}

/** An IAM app that lists one of the bindings scanned for */
export interface IamAppBindingUsage {
    /** The binding (as asked for, upper case) */
    binding: string;
    app: string;
    packageName: string;
    /** relServiceType of the matching row (INA1, G4BA, ...) */
    serviceType: string;
}

export interface IamBindingUsageScan {
    usages: IamAppBindingUsage[];
    /** IAM apps listed for the scan; 0 means nothing was checked (no app matched the patterns/packages) */
    appsScanned: number;
    /** Apps that could not be read (e.g. 403); their services were not checked */
    unreadable: string[];
}

export interface FindIamAppsUsingBindingsOptions {
    /** Only apps in these packages (default: any package) */
    packages?: string[];
    /** IAM app name patterns to scan (default: ['Z*', 'Y*']) */
    namePatterns?: string[];
}
