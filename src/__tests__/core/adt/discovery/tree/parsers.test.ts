/**
 * Unit Tests for Tree Parsers
 *
 * Tests XML parsing for virtualfolders responses:
 * - parseTreeXml() - parsing virtualFolder elements
 * - transformToTreeResponse() - transforming parsed data
 * - constructTreeBody() - building XML requests
 */

import { describe, it, expect } from 'bun:test';
import {
    parseTreeXml,
    transformToTreeResponse,
    constructTreeBody,
    buildQueryFromPath,
} from '../../../../../core/adt/discovery/tree/parsers';
import type { TreeDiscoveryQuery, ParseResult } from '../../../../../core/adt/discovery/tree/types';

// Test Fixtures

const VIRTUALFOLDERS_WITH_PACKAGES = `<?xml version="1.0" encoding="UTF-8"?>
<vfs:virtualFoldersResult xmlns:vfs="http://www.sap.com/adt/ris/virtualFolders" objectCount="383633">
  <vfs:virtualFolder hasChildrenOfSameFacet="true" uri="/sap/bc/adt/packages/%2faif%2fstruc" counter="7621" text="SAP Application Interface Framework - Structure Package" name="/AIF/STRUC" displayName="/AIF/STRUC" facet="PACKAGE">
  </vfs:virtualFolder>
  <vfs:virtualFolder hasChildrenOfSameFacet="true" uri="/sap/bc/adt/packages/%2fclmdv%2fdv" counter="734" text="Main Package for Data Validation Framework" name="/CLMDV/DV" displayName="/CLMDV/DV" facet="PACKAGE">
  </vfs:virtualFolder>
  <vfs:virtualFolder hasChildrenOfSameFacet="false" uri="/sap/bc/adt/packages/%2fsapdmc%2flsmw" counter="555" text="Legacy System Migration Workbench" name="/SAPDMC/LSMW" displayName="/SAPDMC/LSMW" facet="PACKAGE">
  </vfs:virtualFolder>
</vfs:virtualFoldersResult>`;

const VIRTUALFOLDERS_WITH_GROUPS = `<?xml version="1.0" encoding="UTF-8"?>
<vfs:virtualFoldersResult xmlns:vfs="http://www.sap.com/adt/ris/virtualFolders" objectCount="15">
  <vfs:virtualFolder hasChildrenOfSameFacet="false" counter="15" text="" name="PACKAGE_INTERFACES" displayName="Package Interfaces" facet="GROUP">
  </vfs:virtualFolder>
  <vfs:virtualFolder hasChildrenOfSameFacet="false" counter="10" text="" name="PROGRAMS" displayName="Programs" facet="GROUP">
  </vfs:virtualFolder>
</vfs:virtualFoldersResult>`;

const VIRTUALFOLDERS_MISSING_COUNTER = `<?xml version="1.0" encoding="UTF-8"?>
<vfs:virtualFoldersResult xmlns:vfs="http://www.sap.com/adt/ris/virtualFolders" objectCount="100">
  <vfs:virtualFolder hasChildrenOfSameFacet="false" text="Package without counter" name="NO_COUNTER" displayName="No Counter" facet="PACKAGE">
  </vfs:virtualFolder>
</vfs:virtualFoldersResult>`;

const VIRTUALFOLDERS_MISSING_TEXT = `<?xml version="1.0" encoding="UTF-8"?>
<vfs:virtualFoldersResult xmlns:vfs="http://www.sap.com/adt/ris/virtualFolders" objectCount="100">
  <vfs:virtualFolder hasChildrenOfSameFacet="false" counter="50" name="NO_TEXT" displayName="No Text" facet="PACKAGE">
  </vfs:virtualFolder>
</vfs:virtualFoldersResult>`;

const VIRTUALFOLDERS_EMPTY = `<?xml version="1.0" encoding="UTF-8"?>
<vfs:virtualFoldersResult xmlns:vfs="http://www.sap.com/adt/ris/virtualFolders" objectCount="0">
</vfs:virtualFoldersResult>`;

const VIRTUALFOLDERS_WITH_DOTDOT_PREFIX = `<?xml version="1.0" encoding="UTF-8"?>
<vfs:virtualFoldersResult xmlns:vfs="http://www.sap.com/adt/ris/virtualFolders" objectCount="15">
  <vfs:virtualFolder hasChildrenOfSameFacet="false" counter="15" text="directly assigned objects" name="..BASIS" displayName="..BASIS" facet="PACKAGE">
  </vfs:virtualFolder>
</vfs:virtualFoldersResult>`;

// parseTreeXml Tests

describe('parseTreeXml', () => {
    describe('parsing packages', () => {
        it('should parse virtualFolder elements with counter and text attributes', () => {
            const [result, error] = parseTreeXml(VIRTUALFOLDERS_WITH_PACKAGES);

            expect(error).toBeNull();
            expect(result).not.toBeNull();
            expect(result!.folders).toHaveLength(3);

            const firstFolder = result!.folders[0]!;
            expect(firstFolder.name).toBe('/AIF/STRUC');
            expect(firstFolder.count).toBe(7621);
            expect(firstFolder.description).toBe('SAP Application Interface Framework - Structure Package');
            expect(firstFolder.facet).toBe('PACKAGE');
        });

        it('should parse all packages with correct counts', () => {
            const [result, error] = parseTreeXml(VIRTUALFOLDERS_WITH_PACKAGES);

            expect(error).toBeNull();
            const counts = result!.folders.map(f => f.count);
            expect(counts).toEqual([7621, 734, 555]);
        });

        it('should parse all packages with correct descriptions', () => {
            const [result, error] = parseTreeXml(VIRTUALFOLDERS_WITH_PACKAGES);

            expect(error).toBeNull();
            const descriptions = result!.folders.map(f => f.description);
            expect(descriptions).toEqual([
                'SAP Application Interface Framework - Structure Package',
                'Main Package for Data Validation Framework',
                'Legacy System Migration Workbench',
            ]);
        });
    });

    describe('parsing groups', () => {
        it('should parse GROUP facet folders', () => {
            const [result, error] = parseTreeXml(VIRTUALFOLDERS_WITH_GROUPS);

            expect(error).toBeNull();
            expect(result!.folders).toHaveLength(2);

            const firstFolder = result!.folders[0]!;
            expect(firstFolder.name).toBe('PACKAGE_INTERFACES');
            expect(firstFolder.displayName).toBe('Package Interfaces');
            expect(firstFolder.count).toBe(15);
            expect(firstFolder.facet).toBe('GROUP');
        });
    });

    describe('edge cases', () => {
        it('should default counter to 0 when missing', () => {
            const [result, error] = parseTreeXml(VIRTUALFOLDERS_MISSING_COUNTER);

            expect(error).toBeNull();
            expect(result!.folders).toHaveLength(1);
            expect(result!.folders[0]!.count).toBe(0);
        });

        it('should not include description when text attribute is missing', () => {
            const [result, error] = parseTreeXml(VIRTUALFOLDERS_MISSING_TEXT);

            expect(error).toBeNull();
            expect(result!.folders).toHaveLength(1);
            expect(result!.folders[0]!.description).toBeUndefined();
        });

        it('should return empty folders array for empty response', () => {
            const [result, error] = parseTreeXml(VIRTUALFOLDERS_EMPTY);

            expect(error).toBeNull();
            expect(result!.folders).toEqual([]);
            expect(result!.objects).toEqual([]);
        });

        it('should strip .. prefix from package names', () => {
            const [result, error] = parseTreeXml(VIRTUALFOLDERS_WITH_DOTDOT_PREFIX);

            expect(error).toBeNull();
            expect(result!.folders).toHaveLength(1);
            expect(result!.folders[0]!.name).toBe('BASIS');
        });

        it('should return empty result for non-XML text', () => {
            // Note: @xmldom/xmldom doesn't throw on plain text, it creates an empty document
            const [result, error] = parseTreeXml('not valid xml');

            expect(error).toBeNull();
            expect(result!.folders).toEqual([]);
            expect(result!.objects).toEqual([]);
        });

        it('should return error for empty XML string', () => {
            const [result, error] = parseTreeXml('');

            expect(result).toBeNull();
            expect(error).not.toBeNull();
        });
    });
});

// transformToTreeResponse Tests

describe('transformToTreeResponse', () => {
    it('should transform PACKAGE facet folders to packages array', () => {
        const parsed: ParseResult = {
            folders: [
                { facet: 'PACKAGE', name: '/AIF/STRUC', displayName: '/AIF/STRUC', count: 7621, description: 'Test desc' },
                { facet: 'PACKAGE', name: 'CHILD_PKG', displayName: 'CHILD_PKG', count: 100, description: 'Child' },
            ],
            objects: [],
        };

        const result = transformToTreeResponse(parsed, 'PARENT');

        expect(result.packages).toHaveLength(2);
        expect(result.packages[0]).toEqual({
            name: '/AIF/STRUC',
            numContents: 7621,
            description: 'Test desc',
        });
    });

    it('should transform GROUP facet folders to folders array', () => {
        const parsed: ParseResult = {
            folders: [
                { facet: 'GROUP', name: 'PROGRAMS', displayName: 'Programs', count: 50 },
                { facet: 'GROUP', name: 'CLASSES', displayName: 'Classes', count: 30 },
            ],
            objects: [],
        };

        const result = transformToTreeResponse(parsed, 'TEST_PKG');

        expect(result.folders).toHaveLength(2);
        expect(result.folders[0]).toEqual({
            name: 'PROGRAMS',
            displayName: 'Programs',
            numContents: 50,
        });
    });

    it('should exclude the queried package from results', () => {
        const parsed: ParseResult = {
            folders: [
                { facet: 'PACKAGE', name: 'PARENT', displayName: 'PARENT', count: 100 },
                { facet: 'PACKAGE', name: 'CHILD', displayName: 'CHILD', count: 50 },
            ],
            objects: [],
        };

        const result = transformToTreeResponse(parsed, 'PARENT');

        expect(result.packages).toHaveLength(1);
        expect(result.packages[0]!.name).toBe('CHILD');
    });

    it('should not include description if not present in parsed data', () => {
        const parsed: ParseResult = {
            folders: [
                { facet: 'PACKAGE', name: 'NO_DESC', displayName: 'NO_DESC', count: 10 },
            ],
            objects: [],
        };

        const result = transformToTreeResponse(parsed, 'OTHER');

        expect(result.packages[0]!.description).toBeUndefined();
    });
});

// constructTreeBody Tests

describe('constructTreeBody', () => {
    it('should build request with package preselection', () => {
        const query: TreeDiscoveryQuery = {
            PACKAGE: { name: '..BASIS', hasChildrenOfSameFacet: false },
        };

        const body = constructTreeBody(query, '*');

        expect(body).toContain('<vfs:preselection facet="package">');
        expect(body).toContain('<vfs:value>..BASIS</vfs:value>');
    });

    it('should include package in facetorder when hasChildrenOfSameFacet is true', () => {
        const query: TreeDiscoveryQuery = {
            PACKAGE: { name: 'BASIS', hasChildrenOfSameFacet: true },
        };

        const body = constructTreeBody(query, '*');

        expect(body).toContain('<vfs:preselection facet="package">');
        expect(body).toContain('<vfs:value>BASIS</vfs:value>');
        expect(body).toContain('<vfs:facet>package</vfs:facet>');
    });

    it('should not include package in facetorder when hasChildrenOfSameFacet is false', () => {
        const query: TreeDiscoveryQuery = {
            PACKAGE: { name: '..BASIS', hasChildrenOfSameFacet: false },
        };

        const body = constructTreeBody(query, '*');

        // facetorder should have group and type, but NOT package
        const facetOrderMatch = body.match(/<vfs:facetorder>([\s\S]*?)<\/vfs:facetorder>/);
        expect(facetOrderMatch).not.toBeNull();
        expect(facetOrderMatch![1]).not.toContain('<vfs:facet>package</vfs:facet>');
        expect(facetOrderMatch![1]).toContain('<vfs:facet>group</vfs:facet>');
    });

    it('should include all facets in facetorder when no preselection', () => {
        const query: TreeDiscoveryQuery = {};

        const body = constructTreeBody(query, '*');

        expect(body).toContain('<vfs:facet>package</vfs:facet>');
        expect(body).toContain('<vfs:facet>group</vfs:facet>');
        expect(body).toContain('<vfs:facet>type</vfs:facet>');
    });
});

// buildQueryFromPath Tests

describe('buildQueryFromPath', () => {
    it('should add .. prefix to package name if not present', () => {
        const query = buildQueryFromPath('BASIS');

        expect(query.PACKAGE?.name).toBe('..BASIS');
    });

    it('should not double-prefix if .. already present', () => {
        const query = buildQueryFromPath('..BASIS');

        expect(query.PACKAGE?.name).toBe('..BASIS');
    });

    it('should set hasChildrenOfSameFacet to false for package', () => {
        const query = buildQueryFromPath('BASIS');

        expect(query.PACKAGE?.hasChildrenOfSameFacet).toBe(false);
    });

    it('should parse first path segment as GROUP', () => {
        const query = buildQueryFromPath('BASIS', 'PROGRAMS');

        expect(query.GROUP?.name).toBe('PROGRAMS');
        expect(query.GROUP?.hasChildrenOfSameFacet).toBe(false);
    });

    it('should parse second path segment as TYPE', () => {
        const query = buildQueryFromPath('BASIS', 'PROGRAMS/PROG');

        expect(query.TYPE?.name).toBe('PROG');
        expect(query.TYPE?.hasChildrenOfSameFacet).toBe(false);
    });
});
