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

/**
 * A lockable ADT URI and a label naming it in error messages
 */
export interface LockTarget {
    uri: string;
    label: string;
}

/**
 * How an object type stores its definition:
 * - source: plain text at {objectUri}/source/main
 * - form: a vendor XML document at {objectUri} (data elements, domains, message classes, lock objects)
 */
export type ObjectKind = 'source' | 'form';

/**
 * Format of a source object's /source/main when it isn't ABAP text:
 * - aff-json: SAP abap-file-formats JSON (served as application/json; compared as parsed values)
 */
export type SourceFormat = 'aff-json';

/**
 * Media type of each source format
 */
export const SOURCE_FORMAT_MEDIA_TYPES: Record<SourceFormat, string> = {
    'aff-json': 'application/json',
};

/**
 * Parent object type for nested objects (function modules → function group)
 */
export interface ContainerConfig {
    endpoint: string;
    nameSpace: string;
    rootName: string;
    type: string;
    label: string;
}

// Configuration for a specific SAP object type
export interface ObjectConfig {
    /** ADT endpoint path (e.g., 'ddic/ddl/sources'); may contain {container} */
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
    /** Source text or XML document; defaults to 'source' */
    kind?: ObjectKind;
    /** Vendor media type of a form object's document */
    contentType?: string;
    /** Lock and delete on the object URI instead of {objectUri}/source/main */
    lockOnObject?: boolean;
    /** Parent object the endpoint is nested under */
    container?: ContainerConfig;
    /** Create in a stateless request of its own context (a stateful create leaves the object enqueued for that session) */
    statelessCreate?: boolean;
    /** Form object whose create ignores its content; filled by lock → PUT → unlock afterwards */
    populateAfterCreate?: boolean;
    /** Saved active; activation is skipped */
    alwaysActive?: boolean;
    /** Content-Type of the create POST when the endpoint rejects the generic one (default application/*) */
    createContentType?: string;
    /** Format of /source/main when it isn't ABAP text (default: plain text) */
    sourceFormat?: SourceFormat;
    /** Source is a CDS-family language (DDL, DCL, BDL, SDL): whitespace next to separators is insignificant */
    cdsSource?: boolean;
    /** Title (and, for programs, authorization group) readable/writable via read/writeObjectAttributes */
    hasAttributes?: boolean;
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
export type ConfiguredExtension = 'asddls' | 'asdcls' | 'astabldt' | 'astablds' | 'aclass' | 'asprog' | 'asinc' | 'srvd' | 'asbdef' | 'asdtel' | 'asdoma' | 'asfunc' | 'asmsag' | 'asfugr' | 'asfinc' | 'asenqu' | 'asnrob';

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
    DATA_ELEMENT = 'Data Element',
    DOMAIN = 'Domain',
    FUNCTION_MODULE = 'Function Module',
    MESSAGE_CLASS = 'Message Class',
    FUNCTION_GROUP = 'Function Group',
    FUNCTION_GROUP_INCLUDE = 'Function Group Include',
    LOCK_OBJECT = 'Lock Object',
    NUMBER_RANGE_OBJECT = 'Number Range Object',
}

/**
 * Function group: the container of function modules
 */
export const FUNCTION_GROUP_CONFIG: ContainerConfig = {
    endpoint: 'functions/groups',
    nameSpace: 'xmlns:group="http://www.sap.com/adt/functions/groups"',
    rootName: 'group:abapFunctionGroup',
    type: 'FUGR/F',
    label: 'Function Group',
};

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
        cdsSource: true,
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
        cdsSource: true,
    },
    'aclass': {
        endpoint: 'oo/classes',
        nameSpace: 'xmlns:class="http://www.sap.com/adt/oo/classes"',
        rootName: 'class:abapClass',
        type: 'CLAS/OC',
        label: ObjectTypeLabel.CLASS,
        extension: 'aclass',
        hasAttributes: true,
    },
    'astabldt': {
        endpoint: 'ddic/tables',
        nameSpace: 'xmlns:blue="http://www.sap.com/wbobj/blue"',
        rootName: 'blue:blueSource',
        type: 'TABL/DT',
        label: ObjectTypeLabel.TABLE,
        extension: 'astabldt',
        cdsSource: true,
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
        cdsSource: true,
    },
    'asprog': {
        endpoint: 'programs/programs',
        nameSpace: 'xmlns:program="http://www.sap.com/adt/programs/programs"',
        rootName: 'program:abapProgram',
        type: 'PROG/P',
        label: ObjectTypeLabel.PROGRAM,
        extension: 'asprog',
        hasAttributes: true,
    },
    'asinc': {
        endpoint: 'programs/includes',
        nameSpace: 'xmlns:include="http://www.sap.com/adt/programs/includes"',
        rootName: 'include:abapInclude',
        type: 'PROG/I',
        label: ObjectTypeLabel.INCLUDE,
        extension: 'asinc',
        hasAttributes: true,
    },
    'srvd': {
        endpoint: 'ddic/srvd/sources',
        nameSpace: 'xmlns:srvd="http://www.sap.com/adt/ddic/srvdsources"',
        rootName: 'srvd:srvdSource',
        type: 'SRVD/SRV',
        label: ObjectTypeLabel.SERVICE_DEFINITION,
        extension: 'srvd',
        cdsSource: true,
        rootAttributes: { 'srvd:srvdSourceType': 'S' },
    },
    'asbdef': {
        endpoint: 'bo/behaviordefinitions',
        nameSpace: 'xmlns:blue="http://www.sap.com/wbobj/blue"',
        rootName: 'blue:blueSource',
        type: 'BDEF/BDO',
        label: ObjectTypeLabel.BEHAVIOR_DEFINITION,
        extension: 'asbdef',
        cdsSource: true,
        requiresImplementationType: true,
    },
    'asdtel': {
        endpoint: 'ddic/dataelements',
        nameSpace: 'xmlns:blue="http://www.sap.com/wbobj/dictionary/dtel"',
        rootName: 'blue:wbobj',
        type: 'DTEL/DE',
        label: ObjectTypeLabel.DATA_ELEMENT,
        extension: 'asdtel',
        kind: 'form',
        contentType: 'application/vnd.sap.adt.dataelements.v2+xml',
        lockOnObject: true,
    },
    'asdoma': {
        endpoint: 'ddic/domains',
        nameSpace: 'xmlns:doma="http://www.sap.com/dictionary/domain"',
        rootName: 'doma:domain',
        type: 'DOMA/DD',
        label: ObjectTypeLabel.DOMAIN,
        extension: 'asdoma',
        kind: 'form',
        contentType: 'application/vnd.sap.adt.domains.v2+xml',
        lockOnObject: true,
    },
    'asfunc': {
        endpoint: 'functions/groups/{container}/fmodules',
        nameSpace: 'xmlns:fmodule="http://www.sap.com/adt/functions/fmodules"',
        rootName: 'fmodule:abapFunctionModule',
        type: 'FUGR/FF',
        label: ObjectTypeLabel.FUNCTION_MODULE,
        extension: 'asfunc',
        lockOnObject: true,
        container: FUNCTION_GROUP_CONFIG,
    },
    'asmsag': {
        endpoint: 'messageclass',
        nameSpace: 'xmlns:mc="http://www.sap.com/adt/MessageClass"',
        rootName: 'mc:messageClass',
        type: 'MSAG/N',
        label: ObjectTypeLabel.MESSAGE_CLASS,
        extension: 'asmsag',
        kind: 'form',
        contentType: 'application/vnd.sap.adt.mc.messageclass+xml',
        lockOnObject: true,
        statelessCreate: true,
        populateAfterCreate: true,
        alwaysActive: true,
    },
    // Content is the main program SAPL<group>; created with SAP's TOP and UXX includes
    'asfugr': {
        endpoint: FUNCTION_GROUP_CONFIG.endpoint,
        nameSpace: FUNCTION_GROUP_CONFIG.nameSpace,
        rootName: FUNCTION_GROUP_CONFIG.rootName,
        type: FUNCTION_GROUP_CONFIG.type,
        label: ObjectTypeLabel.FUNCTION_GROUP,
        extension: 'asfugr',
        hasAttributes: true,
        lockOnObject: true,
    },
    // L<group>xxx includes; creating one appends its INCLUDE line to the main program
    'asfinc': {
        endpoint: 'functions/groups/{container}/includes',
        nameSpace: 'xmlns:finclude="http://www.sap.com/adt/functions/fincludes"',
        rootName: 'finclude:abapFunctionGroupInclude',
        type: 'FUGR/I',
        label: ObjectTypeLabel.FUNCTION_GROUP_INCLUDE,
        extension: 'asfinc',
        hasAttributes: true,
        lockOnObject: true,
        container: FUNCTION_GROUP_CONFIG,
        createContentType: 'application/vnd.sap.adt.functions.fincludes.v2+xml',
        // A stateful create after the session activated the group fails ("SAPL<group> not found")
        // and leaves SAPL<group> enqueued; see functionGroup/oneAtATimePerGroup
        statelessCreate: true,
    },
    // SE11 lock object; activation generates ENQUEUE_/DEQUEUE_<name>
    'asenqu': {
        endpoint: 'ddic/lockobjects/sources',
        nameSpace: 'xmlns:enqu="http://www.sap.com/adt/ddic/enqu"',
        rootName: 'enqu:lockobject',
        type: 'ENQU/DL',
        label: ObjectTypeLabel.LOCK_OBJECT,
        extension: 'asenqu',
        kind: 'form',
        contentType: 'application/vnd.sap.adt.lockobjects.v1+xml',
        lockOnObject: true,
        // The create POST stores every lock parameter as not wanted
        populateAfterCreate: true,
    },
    // SNRO number range object; content is SAP's abap-file-formats JSON (nrob-v1). Intervals are not in ADT.
    'asnrob': {
        endpoint: 'numberranges/objects',
        nameSpace: 'xmlns:blue="http://www.sap.com/wbobj/blue"',
        rootName: 'blue:blueSource',
        type: 'NROB/NRO',
        label: ObjectTypeLabel.NUMBER_RANGE_OBJECT,
        extension: 'asnrob',
        lockOnObject: true,
        createContentType: 'application/vnd.sap.adt.blues.v1+xml',
        sourceFormat: 'aff-json',
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
