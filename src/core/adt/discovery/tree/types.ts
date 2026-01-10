/**
 * Tree types — Public and internal type definitions
 */

// Public response types

export interface TreeResponse {
    packages: PackageNode[];
    folders: FolderNode[];
    objects: ObjectNode[];
}

export interface PackageNode {
    name: string;
    description?: string;
    numContents: number;
}

export interface FolderNode {
    name: string;
    displayName: string;
    numContents: number;
}

export interface ApiState {
    useInCloudDevelopment: boolean;
    useInCloudDvlpmntActive: boolean;
    useInKeyUserApps: boolean;
}

export interface ObjectNode {
    name: string;
    objectType: string;
    extension: string;
    apiState?: ApiState;
}

// Internal types

export interface VirtualFolder {
    name: string;
    hasChildrenOfSameFacet: boolean;
}

export interface TreeDiscoveryQuery {
    PACKAGE?: VirtualFolder;
    TYPE?: VirtualFolder;
    GROUP?: VirtualFolder;
    API?: VirtualFolder;
}

export interface ParsedFolder {
    facet: 'PACKAGE' | 'GROUP' | 'TYPE' | 'API';
    name: string;
    displayName: string;
    description?: string;
    count: number;
}

export interface ParsedObject {
    name: string;
    objectType: string;
    extension: string;
}

export interface ParseResult {
    folders: ParsedFolder[];
    objects: ParsedObject[];
}

// API folder names that indicate release states
export const API_FOLDERS = [
    'NOT_RELEASED',
    'USE_IN_CLOUD_DEVELOPMENT',
    'USE_IN_CLOUD_DVLPMNT_ACTIVE',
    'USE_IN_KEY_USER_APPS',
] as const;
