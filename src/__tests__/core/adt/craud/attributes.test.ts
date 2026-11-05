/**
 * Unit Tests for object attributes (title, program authorization group)
 *
 * - Title and authorization group are read from the metadata document
 * - Edits touch only the root description and the authorizationGroup element
 * - Unchanged attributes produce no PUT; an over-long title is refused
 */

import { describe, it, expect } from 'bun:test';
import { editMetadata, parseObjectAttributes, writeObjectAttributes } from '../../../../core/adt/attributes';
import type { AdtRequestor } from '../../../../core/adt';

const PROGRAM_XML = `<?xml version="1.0" encoding="utf-8"?><program:abapProgram program:programType="executableProgram" adtcore:name="ZPROG" adtcore:type="PROG/P" adtcore:description="Old &amp; title" adtcore:descriptionTextLimit="70" xmlns:program="http://www.sap.com/adt/programs/programs" xmlns:adtcore="http://www.sap.com/adt/core"><adtcore:packageRef adtcore:name="$TMP" adtcore:description="pkg"/><program:authorizationGroup><program:ref adtcore:name="BCA_REL0"/></program:authorizationGroup></program:abapProgram>`;
const CLASS_XML = `<?xml version="1.0" encoding="utf-8"?><class:abapClass adtcore:name="ZCL" adtcore:description="Class" adtcore:descriptionTextLimit="60" xmlns:class="http://www.sap.com/adt/oo/classes" xmlns:adtcore="http://www.sap.com/adt/core"></class:abapClass>`;
const PROG = { name: 'ZPROG', extension: 'asprog' };

describe('parseObjectAttributes', () => {
    it('reads title, limit, program type and authorization group', () => {
        const [info] = parseObjectAttributes(PROGRAM_XML, PROG);
        expect(info).toEqual({ name: 'ZPROG', extension: 'asprog', title: 'Old & title', titleMaxLength: 70, programType: 'executableProgram', authorizationGroup: 'BCA_REL0' });
    });

    it('has no authorization group for other types', () => {
        const [info] = parseObjectAttributes(CLASS_XML, { name: 'ZCL', extension: 'aclass' });
        expect(info!.authorizationGroup).toBeUndefined();
        expect(info!.title).toBe('Class');
    });
});

describe('editMetadata', () => {
    const [current] = parseObjectAttributes(PROGRAM_XML, PROG);

    it('replaces the root description only', () => {
        const [edit] = editMetadata(PROGRAM_XML, current!, { title: 'New <title>' });
        expect(edit!.changed).toEqual(['title']);
        expect(parseObjectAttributes(edit!.xml, PROG)[0]!.title).toBe('New <title>');
        expect(edit!.xml).toContain('adtcore:description="pkg"');
    });

    it('replaces and clears the authorization group', () => {
        const [replaced] = editMetadata(PROGRAM_XML, current!, { authorizationGroup: 'f_005' });
        expect(replaced!.changed).toEqual(['authorizationGroup']);
        expect(replaced!.xml).toContain('<program:authorizationGroup><program:ref adtcore:name="F_005"/></program:authorizationGroup></program:abapProgram>');
        expect(replaced!.xml).not.toContain('BCA_REL0');

        const [cleared] = editMetadata(PROGRAM_XML, current!, { authorizationGroup: '' });
        expect(cleared!.xml).not.toContain('authorizationGroup');
    });

    it('works with other prefixes and a self-closing root', () => {
        const xml = '<p:abapProgram xmlns:p="http://www.sap.com/adt/programs/programs" xmlns:core="http://www.sap.com/adt/core" core:name="ZPROG" core:description="Old"/>';
        const [info] = parseObjectAttributes(xml, PROG);
        const [edit, error] = editMetadata(xml, info!, { title: 'New', authorizationGroup: 'grp' });
        expect(error).toBeNull();
        expect(edit!.changed).toEqual(['title', 'authorizationGroup']);
        expect(parseObjectAttributes(edit!.xml, PROG)[0]).toMatchObject({ title: 'New', authorizationGroup: 'GRP' });
        expect(edit!.xml).toContain('<p:authorizationGroup><p:ref core:name="GRP"/></p:authorizationGroup>');
    });

    it('fails instead of reporting a change it did not make', () => {
        const noDescription = '<program:abapProgram xmlns:program="http://www.sap.com/adt/programs/programs" xmlns:adtcore="http://www.sap.com/adt/core" adtcore:name="ZPROG"/>';
        const [, titleErr] = editMetadata(noDescription, { name: 'ZPROG', extension: 'asprog', title: 'Old' }, { title: 'New' });
        expect(titleErr?.message).toContain('no description');

        const [, groupErr] = editMetadata(CLASS_XML, { name: 'ZCL', extension: 'aclass', title: 'Class', authorizationGroup: '' }, { authorizationGroup: 'X' });
        expect(groupErr?.message).toContain('not a program');
    });

    it('reports nothing changed for equal values', () => {
        const [edit] = editMetadata(PROGRAM_XML, current!, { title: 'Old & title', authorizationGroup: 'bca_rel0' });
        expect(edit).toEqual({ xml: PROGRAM_XML, changed: [] });
    });

    it('refuses a title longer than SAP allows', () => {
        const [, error] = editMetadata(PROGRAM_XML, current!, { title: 'x'.repeat(71) });
        expect(error?.message).toContain('SAP allows 70');
    });
});

describe('writeObjectAttributes', () => {
    it('does not lock or PUT when nothing differs', async () => {
        const methods: string[] = [];
        const requestor: AdtRequestor = {
            request: async (options) => {
                methods.push(options.method);
                return [new Response(PROGRAM_XML, { status: 200, headers: { 'content-type': 'application/vnd.sap.adt.programs.programs.v3+xml; charset=utf-8' } }), null];
            },
        };
        const [result, error] = await writeObjectAttributes(requestor, PROG, { title: 'Old & title' });
        expect(error).toBeNull();
        expect(result!.changed).toEqual([]);
        expect(methods).toEqual(['GET']);
    });

    it('locks, PUTs with the served media type, and unlocks', async () => {
        const calls: { method: string; contentType?: string }[] = [];
        const requestor: AdtRequestor = {
            request: async (options) => {
                const call: { method: string; contentType?: string } = { method: options.method };
                if (options.headers?.['Content-Type']) call.contentType = options.headers['Content-Type'];
                calls.push(call);
                if (options.params?.['_action'] === 'LOCK') return [new Response('<LOCK_HANDLE>H1</LOCK_HANDLE>', { status: 200 }), null];
                return [new Response(PROGRAM_XML, { status: 200, headers: { 'content-type': 'application/vnd.sap.adt.programs.programs.v3+xml; charset=utf-8' } }), null];
            },
        };
        const [result] = await writeObjectAttributes(requestor, PROG, { title: 'New' });
        expect(result!.changed).toEqual(['title']);
        expect(calls.map(c => c.method)).toEqual(['GET', 'POST', 'PUT', 'POST']);
        expect(calls[2]!.contentType).toBe('application/vnd.sap.adt.programs.programs.v3+xml; charset=utf-8');
    });

    it('refuses an authorization group on a non-program', async () => {
        const requestor: AdtRequestor = { request: async () => [new Response('', { status: 500 }), null] };
        const [, error] = await writeObjectAttributes(requestor, { name: 'ZCL', extension: 'aclass' }, { authorizationGroup: 'X' });
        expect(error?.message).toContain('only programs');
    });
});
