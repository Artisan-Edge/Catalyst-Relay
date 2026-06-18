// ADT Object Type Configuration — metadata for SAP development objects

import type { AsyncResult } from '../../types/result';

// Client interface for ADT requests
export interface AdtRequestor {
    request(options: {
        method: 'GET' | 'POST' | 'PUT' | 'DELETE';
        path: string;
        params?: Record<string, string | number>;
        headers?: Record<string, string>;
        body?: string;
        timeout?: number;
    }): AsyncResult<Response, Error>;
}

// Configuration for a specific SAP object type
export interface ObjectConfig {
    /** ADT endpoint path (e.g., 'ddic/ddl/sources') */
    endpoint: string;
    /** XML namespace for creation requests */
    nameSpace: string;
    /** Root element name for creation XML */
    rootName: string;
    /** SAP ADT object type identifier (e.g., 'DDLS/DF') */
    type: string;
    /** Human-readable label (e.g., 'View') */
    label: string;
    /** File extension (e.g., 'asddls') */
    extension: string;
    /** Data preview endpoint (if supported) */
    dpEndpoint?: string;
    /** Data preview parameter name (if supported) */
    dpParam?: string;
    /** Extra attributes to add to the root element on create (e.g., srvd:srvdSourceType) */
    rootAttributes?: Record<string, string>;
    /** Inject an <adtcore:adtTemplate> block carrying the implementation type (behavior definitions) */
    requiresImplementationType?: boolean;
}

/**
 * Result of upsert operation
 */
export interface UpsertResult {
    name: string;
    extension: string;
    status: 'created' | 'updated' | 'unchanged';
    transport?: string;
}

/**
 * Supported object types
 */
export type ConfiguredExtension = 'asddls' | 'asdcls' | 'astabldt' | 'astablds' | 'aclass' | 'asprog' | 'asinc' | 'srvd' | 'asbdef';

/**
 * Object type labels
 */
export enum ObjectTypeLabel {
    VIEW = 'View',
    ACCESS_CONTROL = 'Access Control',
    TABLE = 'Table',
    STRUCTURE = 'Structure',
    CLASS = 'Class',
    PROGRAM = 'ABAP Program',
    INCLUDE = 'ABAP Include',
    SERVICE_DEFINITION = 'Service Definition',
    BEHAVIOR_DEFINITION = 'Behavior Definition',
}

/**
 * Configuration map for all supported object types
 *
 * Maps file extensions to their ADT configuration.
 * This is the central registry for object type metadata.
 */
export const OBJECT_CONFIG_MAP: Record<ConfiguredExtension, ObjectConfig> = {
    'asddls': {
        endpoint: 'ddic/ddl/sources',
        nameSpace: 'xmlns:ddl="http://www.sap.com/adt/ddic/ddlsources"',
        rootName: 'ddl:ddlSource',
        type: 'DDLS/DF',
        label: ObjectTypeLabel.VIEW,
        extension: 'asddls',
        dpEndpoint: 'cds',
        dpParam: 'ddlSourceName',
    },
    'asdcls': {
        endpoint: 'acm/dcl/sources',
        nameSpace: 'xmlns:dcl="http://www.sap.com/adt/acm/dclsources"',
        rootName: 'dcl:dclSource',
        type: 'DCLS/DL',
        label: ObjectTypeLabel.ACCESS_CONTROL,
        extension: 'asdcls',
    },
    'aclass': {
        endpoint: 'oo/classes',
        nameSpace: 'xmlns:class="http://www.sap.com/adt/oo/classes"',
        rootName: 'class:abapClass',
        type: 'CLAS/OC',
        label: ObjectTypeLabel.CLASS,
        extension: 'aclass',
    },
    'astabldt': {
        endpoint: 'ddic/tables',
        nameSpace: 'xmlns:blue="http://www.sap.com/wbobj/blue"',
        rootName: 'blue:blueSource',
        type: 'TABL/DT',
        label: ObjectTypeLabel.TABLE,
        extension: 'astabldt',
        dpEndpoint: 'ddic',
        dpParam: 'ddicEntityName',
    },
    'astablds': {
        endpoint: 'ddic/structures',
        nameSpace: 'xmlns:blue="http://www.sap.com/wbobj/blue"',
        rootName: 'blue:blueSource',
        type: 'STRU/D',
        label: ObjectTypeLabel.STRUCTURE,
        extension: 'astablds',
    },
    'asprog': {
        endpoint: 'programs/programs',
        nameSpace: 'xmlns:program="http://www.sap.com/adt/programs/programs"',
        rootName: 'program:abapProgram',
        type: 'PROG/P',
        label: ObjectTypeLabel.PROGRAM,
        extension: 'asprog',
    },
    'asinc': {
        endpoint: 'programs/includes',
        nameSpace: 'xmlns:include="http://www.sap.com/adt/programs/includes"',
        rootName: 'include:abapInclude',
        type: 'PROG/I',
        label: ObjectTypeLabel.INCLUDE,
        extension: 'asinc',
    },
    'srvd': {
        endpoint: 'ddic/srvd/sources',
        nameSpace: 'xmlns:srvd="http://www.sap.com/adt/ddic/srvdsources"',
        rootName: 'srvd:srvdSource',
        type: 'SRVD/SRV',
        label: ObjectTypeLabel.SERVICE_DEFINITION,
        extension: 'srvd',
        rootAttributes: { 'srvd:srvdSourceType': 'S' },
    },
    'asbdef': {
        endpoint: 'bo/behaviordefinitions',
        nameSpace: 'xmlns:blue="http://www.sap.com/wbobj/blue"',
        rootName: 'blue:blueSource',
        type: 'BDEF/BDO',
        label: ObjectTypeLabel.BEHAVIOR_DEFINITION,
        extension: 'asbdef',
        requiresImplementationType: true,
    },
};

/**
 * Get object configuration by extension
 *
 * @param extension - File extension (e.g., 'asddls')
 * @returns Configuration or null if not found
 */
export function getConfigByExtension(extension: string): ObjectConfig | null {
    return OBJECT_CONFIG_MAP[extension as ConfiguredExtension] ?? null;
}

/**
 * Get object configuration by ADT type
 *
 * @param type - ADT type identifier (e.g., 'DDLS/DF')
 * @returns Configuration or null if not found
 */
export function getConfigByType(type: string): ObjectConfig | null {
    for (const config of Object.values(OBJECT_CONFIG_MAP)) {
        if (config.type === type) {
            return config;
        }
    }
    return null;
}

/**
 * Get all configured extensions
 *
 * @returns Array of supported extensions
 */
export function getAllExtensions(): ConfiguredExtension[] {
    return Object.keys(OBJECT_CONFIG_MAP) as ConfiguredExtension[];
}

/**
 * Get all configured ADT types
 *
 * @returns Array of supported ADT types
 */
export function getAllTypes(): string[] {
    return Object.values(OBJECT_CONFIG_MAP).map(config => config.type);
}

/**
 * Check if extension is supported
 *
 * @param extension - Extension to check
 * @returns True if supported
 */
export function isExtensionSupported(extension: string): extension is ConfiguredExtension {
    return extension in OBJECT_CONFIG_MAP;
}
