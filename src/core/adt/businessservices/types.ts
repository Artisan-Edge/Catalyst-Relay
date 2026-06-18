// Service binding types — programmatic OData service binding creation

import type { ActivationResult } from '../craud/activation';

/** Binding protocol. Only OData is supported today. */
export type ServiceBindingType = 'ODATA';

/** Binding version. Only OData V4 (category 1) is supported today. */
export type ServiceBindingVersion = 'V4';

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
    /** Transport request (required for non-$TMP packages) */
    transport?: string;
    /** Whether to publish the binding after activation (default: true) */
    publish?: boolean;
}

/**
 * Result of creating a service binding
 */
export interface ServiceBindingResult {
    name: string;
    serviceDefinition: string;
    created: boolean;
    activation: ActivationResult[];
    published: boolean;
    publishMessage?: string;
}
