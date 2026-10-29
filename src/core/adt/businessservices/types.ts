// Service binding types — programmatic OData service binding creation

import type { ActivationResult } from '../craud/activation';

/** Binding protocol. Only OData is supported today. */
export type ServiceBindingType = 'ODATA';

/** Binding version: OData V4 or OData V2. */
export type ServiceBindingVersion = 'V4' | 'V2';

/**
 * Binding category: a UI binding (srvb:category 0) is started by business users through
 * IAM app → business catalog → business role; a Web API binding (category 1) is reached
 * through communication arrangements.
 */
export type ServiceBindingCategory = 'UI' | 'WEB_API';

/**
 * Options for creating a service binding
 */
export interface CreateServiceBindingOptions {
    /** Name of the service binding to create (e.g., 'ZBEACON_DOCS_O5') */
    bindingName: string;
    /** Name of the backing service definition (e.g., 'ZBEACON_DOCS_API') */
    serviceDefinition: string;
    /** Target package */
    packageName: string;
    /** Optional description */
    description?: string;
    /** Binding protocol (default: 'ODATA') */
    bindingType?: ServiceBindingType;
    /** Binding version (default: 'V4') */
    bindingVersion?: ServiceBindingVersion;
    /** Binding category (default: 'WEB_API') */
    bindingCategory?: ServiceBindingCategory;
    /** Transport request (required for non-$TMP packages) */
    transport?: string;
    /** Whether to publish the binding after activation (default: true) */
    publish?: boolean;
    /** Accept a WARNING from the pre-create validation instead of aborting (default: false) */
    allowWarnings?: boolean;
}

/** DONE: the step ran. SKIPPED: the binding was already in the state the step produces, or the step was disabled. */
export type ServiceBindingStepStatus = 'DONE' | 'SKIPPED';

export interface ServiceBindingSteps {
    validate: ServiceBindingStepStatus;
    create: ServiceBindingStepStatus;
    activate: ServiceBindingStepStatus;
    publish: ServiceBindingStepStatus;
}

/**
 * Result of creating a service binding
 */
export interface ServiceBindingResult {
    name: string;
    serviceDefinition: string;
    category: ServiceBindingCategory;
    /** False when the binding already existed and creation was skipped */
    created: boolean;
    activation: ActivationResult[];
    published: boolean;
    publishMessage?: string;
    steps: ServiceBindingSteps;
    /** INFO/WARNING texts from validation and publish, and how a failed publish request was resolved */
    notes: string[];
}

/**
 * A service binding as read back from ADT
 */
export interface ServiceBindingInfo {
    name: string;
    description: string;
    packageName: string;
    /** Service name inside the binding (the definition name on V4, the binding name on V2) */
    serviceName: string;
    serviceDefinition: string;
    /** Service version, e.g. '0001' */
    serviceVersion: string;
    bindingType: string;
    odataVersion: string;
    category: ServiceBindingCategory;
    published: boolean;
    /** True when the read returned the active version */
    active: boolean;
    /** API release state of the service, e.g. 'NOT_RELEASED' */
    releaseState: string;
}
