/**
 * ADT Object Type Configuration
 *
 * Defines metadata for each supported SAP development object type.
 * This configuration maps file extensions to their ADT endpoints,
 * XML namespaces, and data preview capabilities.
 */

/**
 * Configuration for a specific SAP object type
 */
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
}

/**
 * Supported object types
 */
export type ConfiguredExtension = 'asddls' | 'asdcls' | 'astabldt' | 'aclass' | 'asprog';

/**
 * Object type labels
 */
export enum ObjectTypeLabel {
    VIEW = 'View',
    ACCESS_CONTROL = 'Access Control',
    TABLE = 'Table',
    CLASS = 'Class',
    PROGRAM = 'ABAP Program',
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
    'asprog': {
        endpoint: 'programs/programs',
        nameSpace: 'xmlns:program="http://www.sap.com/adt/programs/programs"',
        rootName: 'program:abapProgram',
        type: 'PROG/P',
        label: ObjectTypeLabel.PROGRAM,
        extension: 'asprog',
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
