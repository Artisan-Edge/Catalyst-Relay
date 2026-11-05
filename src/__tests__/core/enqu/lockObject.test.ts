/**
 * Unit Tests for lock objects (.asenqu DSL ↔ ADT document)
 *
 * The fixture is a real GET response of EZSNAP_TAB from an S/4HANA system (SAP_BASIS 758).
 */

import { describe, it, expect } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import {
    buildLockObjectXml,
    lockObjectsEquivalent,
    mergeLockObjectXml,
    parseLockObject,
    parseLockObjectXml,
    serializeLockObject,
    validateLockObject,
} from '../../../core/enqu';
import type { LockObjectDef } from '../../../core/enqu';
import { getFormHandler } from '../../../core/forms';

const FIXTURE = fs.readFileSync(path.join(import.meta.dir, '../../fixtures/enqu/ezsnap_tab.xml'), 'utf8');

const EZSNAP_TAB = `@EndUserText.label: 'SNAP Table Lock'
@AllowRFC: true
define lock object ezsnap_tab {
\tprimary table : zsnap_tablist lock mode E;
\tlock parameters {
\t\tmandt   : zsnap_tablist.mandt;
\t\ttabname : zsnap_tablist.tabname;
\t}
}
`;

function parsed(source: string): LockObjectDef {
    const [def, error] = parseLockObject(source);
    if (error) throw error;
    return def;
}

describe('parseLockObject', () => {
    it('parses annotations, tables and parameters', () => {
        const def = parsed(`@EndUserText.label: 'PO lock'
@AllowRFC: false
define lock object ezpo {
  primary table ekko lock mode e;
  secondary table : ekpo lock mode S;
  lock parameters {
    mandt : ekko.mandt;
    po    : ekko.ebeln;
    item  : ekpo.ebelp not wanted;
  }
}`);
        expect(def.description).toBe('PO lock');
        expect(def.allowRfc).toBe(false);
        expect(def.primary).toEqual({ table: 'ekko', lockMode: 'E' });
        expect(def.secondary).toEqual([{ table: 'ekpo', lockMode: 'S' }]);
        expect(def.parameters[1]).toEqual({ name: 'po', table: 'ekko', field: 'ebeln', wanted: true });
        expect(def.parameters[2]!.wanted).toBe(false);
    });

    it('reports positioned errors', () => {
        const [, error] = parseLockObject('define lock object ezx {\n  primary table t lock mode Q;\n}');
        expect(error?.message).toContain('Expected a lock mode (E, S, X)');
        expect(error?.message).toContain('line 2');

        const [, missing] = parseLockObject('define lock object ezx {\n  primary table t lock mode E;\n}');
        expect(missing?.message).toContain('lock parameters');
    });
});

describe('serializeLockObject', () => {
    it('round-trips the canonical form', () => {
        expect(serializeLockObject(parsed(EZSNAP_TAB))).toBe(EZSNAP_TAB);
    });

    it('omits @AllowRFC when false and marks not-wanted parameters', () => {
        const text = serializeLockObject({ ...parsed(EZSNAP_TAB), allowRfc: false, parameters: [{ name: 'MANDT', table: 'ZSNAP_TABLIST', field: 'MANDT', wanted: false }] });
        expect(text).not.toContain('@AllowRFC');
        expect(text).toContain('mandt : zsnap_tablist.mandt not wanted;');
    });
});

describe('validateLockObject', () => {
    it('accepts EZSNAP_TAB', () => {
        expect(validateLockObject(parsed(EZSNAP_TAB))[1]).toBeNull();
    });

    it('rejects names without E, unknown parameter tables and duplicates', () => {
        const def = parsed(EZSNAP_TAB);
        expect(validateLockObject({ ...def, name: 'ZSNAP_TAB' })[1]?.message).toContain('must start with E');
        expect(validateLockObject({ ...def, parameters: [{ name: 'X', table: 'OTHER', field: 'X', wanted: true }] })[1]?.message).toContain('not the primary or a secondary table');
        expect(validateLockObject({ ...def, parameters: [...def.parameters, def.parameters[0]!] })[1]?.message).toContain('declared twice');
        expect(validateLockObject({ ...def, description: '' })[1]?.message).toContain('description');
    });
});

describe('lock object XML', () => {
    it('reads the server document as the canonical DSL', () => {
        const [def, error] = parseLockObjectXml(FIXTURE);
        expect(error).toBeNull();
        expect(serializeLockObject(def!)).toBe(EZSNAP_TAB);
    });

    it('builds a create document with the full content', () => {
        const [xml] = buildLockObjectXml(parsed(EZSNAP_TAB), { name: 'EZSNAP_TAB', packageName: '$TMP', responsible: 'me' });
        expect(xml).toContain('adtcore:type="ENQU/DL"');
        expect(xml).toContain('<adtcore:packageRef adtcore:name="$TMP"/>');
        const [back] = parseLockObjectXml(xml!);
        expect(serializeLockObject(back!)).toBe(EZSNAP_TAB);
    });

    it('merges by replacing the content, always sending every parameter and dropping lock modules', () => {
        const changed = { ...parsed(EZSNAP_TAB), description: 'Changed', parameters: [{ name: 'MANDT', table: 'ZSNAP_TABLIST', field: 'MANDT', wanted: true }, { name: 'TABNAME', table: 'ZSNAP_TABLIST', field: 'TABNAME', wanted: false }] };
        const [xml, error] = mergeLockObjectXml(FIXTURE, changed);
        expect(error).toBeNull();
        expect(xml).not.toContain('lockModules');
        expect(xml).toContain('adtcore:packageRef');
        expect((xml!.match(/<enqu:lockParameter>/g) ?? []).length).toBe(2);
        const [back] = parseLockObjectXml(xml!);
        expect(back!.description).toBe('Changed');
        expect(back!.parameters[1]!.wanted).toBe(false);
    });

    it('treats name case and whitespace as equivalent', () => {
        const [remote] = parseLockObjectXml(FIXTURE);
        expect(lockObjectsEquivalent(parsed(EZSNAP_TAB.replace(/\t/g, '  ').toUpperCase().replace("'SNAP TABLE LOCK'", "'SNAP Table Lock'")), remote!)).toBe(true);
    });
});

describe('asenqu form handler', () => {
    it('is registered and checks the declared name', () => {
        const handler = getFormHandler('asenqu');
        expect(handler).not.toBeNull();
        expect(handler!.declaredName(EZSNAP_TAB)).toEqual(['ezsnap_tab', null]);
        expect(handler!.equivalent(EZSNAP_TAB, EZSNAP_TAB)).toEqual([true, null]);
    });

    it('ignores a leading UTF-8 BOM', () => {
        const handler = getFormHandler('asenqu')!;
        expect(handler.declaredName(`﻿${EZSNAP_TAB}`)).toEqual(['ezsnap_tab', null]);
        expect(handler.equivalent(`﻿${EZSNAP_TAB}`, EZSNAP_TAB)).toEqual([true, null]);
    });
});

describe('unknown lock modes', () => {
    it('are an error, not a silent E', () => {
        const [, error] = parseLockObjectXml(FIXTURE.replace(/<enqu:lockMode>E<\/enqu:lockMode>/, '<enqu:lockMode>U</enqu:lockMode>'));
        expect(error?.message).toContain("lock mode 'U'");
    });
});
