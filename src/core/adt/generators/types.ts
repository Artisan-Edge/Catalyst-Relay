// Multidimensional Analysis (MDA) app generator types (/sap/bc/adt/analytics/generators/ui/mda-app)

/** Objects the generator creates; every name is the caller's */
export interface MdaAppOptions {
    /** Analytical query (DDLS) the app is generated for */
    queryName: string;
    packageName: string;
    /** Transport request, sent as corrNr (unverified: tested only in a local package) */
    transport?: string;
    /** UIAD (app descriptor item), at most 32 characters */
    appDescriptor: string;
    /** SAPUI5 component ID of the app variant, e.g. customer.ZSNAP_F70_AV */
    appVariantId: string;
    title: string;
    subTitle?: string;
    semanticObject: string;
    semanticAction: string;
    /** e.g. sap-icon://line-charts */
    icon?: string;
    /** SRVD (InA), at most 30 characters */
    serviceDefinition: string;
    /** SRVB (InA), at most 30 characters */
    serviceBinding: string;
    /** SIA6 (IAM app), at most 35 characters; omitted: no cloudIam block is sent */
    iamApp?: string;
    /** Master language (default 'EN') */
    masterLanguage?: string;
    /** ABAP language version (default '5', ABAP for Cloud Development) */
    abapLanguageVersion?: string;
    /** Generate request timeout (default 300 s) */
    timeoutMs?: number;
}

/** A generated object, as each generator response names it */
export type MdaObjectKind = 'appDescriptor' | 'appVariant' | 'serviceDefinition' | 'serviceBinding' | 'iamApp';

/** One validation message (severity OK, INFO, WARNING, ERROR) */
export interface MdaValidationMessage {
    severity: string;
    text: string;
}

/** Validation outcome: which objects exist, and every other error */
export interface MdaAppValidation {
    messages: MdaValidationMessage[];
    /** Objects SAP reports as already existing */
    existing: MdaObjectKind[];
    /** Objects the options name (iamApp only when given) */
    expected: MdaObjectKind[];
    /** ERROR messages that are not "already exists" */
    errors: string[];
    /** 'absent': nothing exists; 'present': every object exists; 'partial': some exist */
    set: 'absent' | 'present' | 'partial';
}

/** An object the generator would create (preview) or created (generate) */
export interface MdaGeneratedObject {
    name: string;
    /** ADT type, e.g. UIAD/TYP, ADVC/LRP, SRVD/SRV, SRVB/SVB, SIA6 */
    type: string;
    uri: string;
}

export interface MdaAppPreview {
    /** Objects with the operation SAP plans (CREATE) */
    objects: Array<MdaGeneratedObject & { operation: string }>;
    /** App variant system name (ADVC/LRP); deterministic for the same appVariantId; null when not listed */
    appVariant: string | null;
}

export type MdaStepStatus = 'DONE' | 'SKIPPED';

export interface MdaGenerateResult {
    /** Generated now, or SKIPPED because validation found the whole set present */
    status: 'created' | 'present';
    appDescriptor: string;
    appVariantId: string;
    /** App variant system name for deleteAppVariant (from the preview); null when the preview did not list it */
    appVariant: string | null;
    serviceDefinition: string;
    serviceBinding: string;
    iamApp: string | null;
    /** Objects the generate response listed ([] when skipped; SAP leaves out the app variant) */
    generated: MdaGeneratedObject[];
    /** Validation messages other than OK */
    messages: MdaValidationMessage[];
    steps: { validate: MdaStepStatus; preview: MdaStepStatus; generate: MdaStepStatus };
    /** The transport was not passed: the package does not record changes (SAP's generator fails with one there) */
    transportSkipped: boolean;
}
