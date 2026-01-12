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

export interface ObjectNode {
    name: string;
    objectType: string;
    extension: string;
    description?: string;
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
    description?: string;
}

export interface ParseResult {
    folders: ParsedFolder[];
    objects: ParsedObject[];
}
