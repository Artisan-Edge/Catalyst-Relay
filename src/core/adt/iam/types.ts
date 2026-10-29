// Cloud IAM types — IAM apps (SIA6), business catalogs (SIA1) and their app assignments (SIA7)

/** Service types an IAM app can list: OData V4 (G4BA service group) or OData V2 (IWSV service). */
export type IamServiceType = 'G4BA' | 'IWSV';

/** A service to put on an IAM app's Services tab */
export interface IamServiceRef {
    /** Service binding name (V4) or V2 technical service name */
    name: string;
    type: IamServiceType;
    /** IWSV service version (default '0001'); ignored for G4BA */
    version?: string;
}

/** A service as listed on an IAM app */
export interface IamAppService {
    /** relServiceName — the binding (V4) or service (V2) name */
    name: string;
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
    services: IamAppService[];
    /** Not proof of a publish: a new app reads 'p' before it was ever published */
    publishStatus: IamPublishStatus;
}

export interface CreateIamAppOptions {
    appName: string;
    packageName: string;
    description: string;
    transport?: string;
    /** Application type (default 'EXT', External App) */
    appType?: string;
    services: IamServiceRef[];
    /** Publish locally after saving (default: true) */
    publish?: boolean;
}

export type IamStepStatus = 'DONE' | 'SKIPPED';

export interface IamAppResult {
    name: string;
    created: boolean;
    /** Services newly added to the app (names); already-listed services are skipped */
    servicesAdded: string[];
    published: boolean;
    publishStatus: IamPublishStatus;
    steps: { create: IamStepStatus; services: IamStepStatus; publish: IamStepStatus };
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
    packageName: string;
    description: string;
    transport?: string;
    /** IAM apps to assign */
    apps: string[];
    /** Publish locally after assigning (default: true) */
    publish?: boolean;
}

export interface BusinessCatalogResult {
    name: string;
    created: boolean;
    /** Assignments newly created; apps already in the catalog are skipped */
    assignmentsAdded: CatalogAppAssignment[];
    published: boolean;
    publishStatus: IamPublishStatus;
    steps: { create: IamStepStatus; assign: IamStepStatus; publish: IamStepStatus };
}
