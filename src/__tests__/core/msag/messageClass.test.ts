/**
 * Unit Tests for message classes (.asmsag JSON ↔ ADT document)
 *
 * XML fixtures are real GET responses captured from an S/4HANA system (SAP_BASIS 758).
 */

import { describe, it, expect } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { DOMParser } from '@xmldom/xmldom';
import {
    buildMessageClassXml,
    messageClassesEquivalent,
    messageClassUpdateBodies,
    parseMessageClass,
    parseMessageClassXml,
    serializeMessageClass,
    validateMessageClass,
} from '../../../core/msag';
import type { MessageClassDef } from '../../../core/msag';
import { getFormHandler } from '../../../core/forms';

const FIXTURES = path.join(import.meta.dir, '../../fixtures/msag');
const MC_NS = 'http://www.sap.com/adt/MessageClass';
const ADTCORE_NS = 'http://www.sap.com/adt/core';
const LOCK = 'LOCK123';

function fixture(name: string): string {
    return fs.readFileSync(path.join(FIXTURES, name), 'utf8');
}

function def(source: string): MessageClassDef {
    const [parsed, error] = parseMessageClass(source);
    if (error) throw error;
    return parsed;
}

// Message attributes of a PUT body, by element local name.
function messagesOf(xml: string, localName: string): Record<string, string>[] {
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    return Array.from(doc.getElementsByTagNameNS(MC_NS, localName)).map(element => {
        const attrs: Record<string, string> = {};
        for (const attr of Array.from(element.attributes)) attrs[attr.localName ?? attr.name] = attr.value;
        return attrs;
    });
}

// Server state of the fixture: 001 (self-explanatory), 002 (not, documented), 003.
const SERVER_SOURCE = `{
  "description": "Catalyst test MC v2",
  "messages": [
    { "number": "001", "text": "First message changed &1 <x> 'q'", "selfExplanatory": true },
    { "number": "002", "text": "Second message", "selfExplanatory": false },
    { "number": "003", "text": "Third message", "selfExplanatory": true }
  ]
}
`;

describe('parseMessageClass', () => {
    it('pads numbers, defaults self-explanatory, sorts and trims trailing blanks', () => {
        const parsed = def('{ "description": "Desc  ", "messages": [ { "number": 2, "text": "B " }, { "number": "1", "text": "A", "selfExplanatory": false } ] }');
        expect(parsed).toEqual({
            description: 'Desc',
            messages: [
                { number: '001', text: 'A', selfExplanatory: false },
                { number: '002', text: 'B', selfExplanatory: true },
            ],
        });
    });

    it('treats a missing messages array as empty', () => {
        expect(def('{ "description": "Only a description" }').messages).toEqual([]);
    });

    it('ignores a leading UTF-8 BOM', () => {
        expect(def('﻿{ "description": "D" }').description).toBe('D');
    });

    it('rejects invalid JSON and unknown keys', () => {
        expect(parseMessageClass('{ "description": ')[1]?.message).toContain('Invalid JSON');
        const [, error] = parseMessageClass('{ "description": "D", "messages": [ { "number": "001", "text": "A", "selfexplanatory": true } ] }');
        expect(error?.message).toContain('messages.0');
    });
});

describe('validateMessageClass', () => {
    const valid: MessageClassDef = { description: 'D', messages: [{ number: '001', text: 'A', selfExplanatory: true }] };

    it('accepts a valid class', () => {
        expect(validateMessageClass(valid)[1]).toBeNull();
    });

    it('accepts an empty description (a class SAP holds without one reads back as "")', () => {
        expect(validateMessageClass({ ...valid, description: '' })[1]).toBeNull();
    });

    it('rejects non-numeric numbers, duplicates, empty or long texts and long descriptions', () => {
        const cases: [MessageClassDef, string][] = [
            [{ ...valid, description: 'x'.repeat(61) }, 'maximum is 60'],
            [{ ...valid, messages: [{ number: 'ABC', text: 'A', selfExplanatory: true }] }, 'three digits'],
            [{ ...valid, messages: [{ number: '1000', text: 'A', selfExplanatory: true }] }, 'three digits'],
            [{ ...valid, messages: [valid.messages[0]!, valid.messages[0]!] }, 'more than once'],
            [{ ...valid, messages: [{ number: '001', text: '', selfExplanatory: true }] }, 'needs a text'],
            [{ ...valid, messages: [{ number: '001', text: 'x'.repeat(74), selfExplanatory: true }] }, 'maximum is 73'],
        ];
        for (const [input, message] of cases) expect(validateMessageClass(input)[1]?.message).toContain(message);
    });
});

describe('serializeMessageClass', () => {
    it('writes one message per line and round-trips', () => {
        const source = serializeMessageClass(def(SERVER_SOURCE));
        expect(source).toBe(SERVER_SOURCE);
        expect(def(source)).toEqual(def(SERVER_SOURCE));
    });

    it('writes an empty message list', () => {
        expect(serializeMessageClass({ description: 'D', messages: [] })).toBe('{\n  "description": "D",\n  "messages": []\n}\n');
    });
});

describe('parseMessageClassXml', () => {
    it('reads description, texts and flags', () => {
        const [parsed, error] = parseMessageClassXml(fixture('message-class.xml'));
        expect(error).toBeNull();
        expect(parsed).toEqual(def(SERVER_SOURCE));
    });

    it('reads a standard class with empty texts and alphanumeric numbers', () => {
        const [parsed] = parseMessageClassXml(fixture('message-class-standard.xml'));
        expect(parsed?.description).toBe('General Basis texts');
        expect(parsed?.messages.map(m => m.number)).toEqual(['000', '001', '002', '003', 'DVW']);
        expect(parsed?.messages[0]).toEqual({ number: '000', text: '', selfExplanatory: true });
        expect(parsed?.messages[2]).toEqual({ number: '002', text: 'Enter a valid value', selfExplanatory: false });
    });

    it('rejects other documents', () => {
        expect(parseMessageClassXml('<a/>')[1]).not.toBeNull();
    });
});

describe('buildMessageClassXml', () => {
    it('builds the create document with name, package and description', () => {
        const [xml] = buildMessageClassXml(def('{ "description": "A & B" }'), { name: 'zfoo', packageName: '$TMP', responsible: 'tester' });
        const doc = new DOMParser().parseFromString(xml!, 'text/xml');
        const root = doc.documentElement!;
        expect(root.getAttributeNS(ADTCORE_NS, 'name')).toBe('ZFOO');
        expect(root.getAttributeNS(ADTCORE_NS, 'type')).toBe('MSAG/N');
        expect(root.getAttributeNS(ADTCORE_NS, 'description')).toBe('A & B');
        expect(root.getAttributeNS(ADTCORE_NS, 'responsible')).toBe('TESTER');
        expect(doc.getElementsByTagNameNS(ADTCORE_NS, 'packageRef')[0]?.getAttributeNS(ADTCORE_NS, 'name')).toBe('$TMP');
    });

    it('requires a description to create a class', () => {
        expect(buildMessageClassXml(def('{ "description": "" }'), { name: 'zfoo', packageName: '$TMP', responsible: 'me' })[1]?.message).toContain('description is required');
    });
});

describe('messageClassUpdateBodies', () => {
    const server = fixture('message-class.xml');

    it('returns no bodies when nothing changes', () => {
        expect(messageClassUpdateBodies(server, def(SERVER_SOURCE), LOCK)).toEqual([[], null]);
    });

    it('updates, deletes, then creates in a second PUT', () => {
        const wanted = def(`{
  "description": "Catalyst test MC v3",
  "messages": [
    { "number": "001", "text": "First message changed &1 <x> 'q'", "selfExplanatory": false },
    { "number": "003", "text": "Third message, edited", "selfExplanatory": true },
    { "number": "004", "text": "Fourth", "selfExplanatory": false }
  ]
}`);
        const [bodies, error] = messageClassUpdateBodies(server, wanted, LOCK);
        expect(error).toBeNull();
        expect(bodies).toHaveLength(2);

        // First PUT: updates carry the lock handle; 002 is deleted.
        const [first, second] = bodies!.map(body => body.body);
        expect(bodies!.map(body => body.label)).toEqual(['description, changed and deleted messages', 'new messages 004']);
        expect(messagesOf(first!, 'messages')).toEqual([
            { msgno: '001', msgtext: "First message changed &1 <x> 'q'", selfexplainatory: 'false', lockhandle: LOCK, documented: 'false' },
            { msgno: '003', msgtext: 'Third message, edited', selfexplainatory: 'true', lockhandle: LOCK, documented: 'false' },
        ]);
        expect(messagesOf(first!, 'deletedmessages')).toEqual([{ msgno: '002' }]);

        // Second PUT: only the new message, no lock handle.
        expect(messagesOf(second!, 'messages')).toEqual([{ msgno: '004', msgtext: 'Fourth', selfexplainatory: 'false' }]);
        expect(messagesOf(second!, 'deletedmessages')).toEqual([]);

        // Both keep the root, package and new description.
        for (const { body } of bodies!) {
            const doc = new DOMParser().parseFromString(body, 'text/xml');
            expect(doc.documentElement?.getAttributeNS(ADTCORE_NS, 'description')).toBe('Catalyst test MC v3');
            expect(doc.documentElement?.getAttributeNS(ADTCORE_NS, 'name')).toBe('ZCATALYST_TEST_MC');
            expect(doc.getElementsByTagNameNS(ADTCORE_NS, 'packageRef')).toHaveLength(1);
        }
    });

    it('sends only creates when the class is new', () => {
        const empty = buildMessageClassXml(def('{ "description": "D" }'), { name: 'ZFOO', packageName: '$TMP', responsible: 'me' })[0]!;
        const [bodies] = messageClassUpdateBodies(empty, def('{ "description": "D", "messages": [ { "number": 1, "text": "A" } ] }'), LOCK);
        expect(bodies).toHaveLength(1);
        expect(messagesOf(bodies![0]!.body, 'messages')).toEqual([{ msgno: '001', msgtext: 'A', selfexplainatory: 'true' }]);
    });

    it('deletes every message missing from the source', () => {
        const [bodies] = messageClassUpdateBodies(server, def('{ "description": "Catalyst test MC v2" }'), LOCK);
        expect(bodies).toHaveLength(1);
        expect(messagesOf(bodies![0]!.body, 'deletedmessages').map(m => m['msgno'])).toEqual(['001', '002', '003']);
    });

    it('accepts an unchanged empty description (class stored without one)', () => {
        const noDescription = server.replace(/ adtcore:description="[^"]*"/, '');
        const [current] = parseMessageClassXml(noDescription);
        expect(current!.description).toBe('');

        // Round trip: the read source written back changes nothing.
        expect(messageClassUpdateBodies(noDescription, current!, LOCK)).toEqual([[], null]);
        const [bodies, error] = messageClassUpdateBodies(noDescription, { ...current!, messages: current!.messages.slice(1) }, LOCK);
        expect(error).toBeNull();
        expect(bodies).toHaveLength(1);
    });

    it('refuses to clear an existing description', () => {
        const [, error] = messageClassUpdateBodies(server, { ...def(SERVER_SOURCE), description: '' }, LOCK);
        expect(error?.message).toContain('cannot be cleared');
    });
});

describe('messageClassesEquivalent', () => {
    it('ignores order and formatting', () => {
        const reordered = def('{"messages":[{"number":3,"text":"Third message"},{"number":"002","text":"Second message","selfExplanatory":false},{"number":"001","text":"First message changed &1 <x> \'q\'"}],"description":"Catalyst test MC v2"}');
        expect(messageClassesEquivalent(reordered, def(SERVER_SOURCE))).toBe(true);
    });

    it('detects text, flag, description and membership changes', () => {
        const base = def(SERVER_SOURCE);
        const changed: MessageClassDef[] = [
            { ...base, description: 'Other' },
            { ...base, messages: base.messages.slice(1) },
            { ...base, messages: base.messages.map(m => (m.number === '002' ? { ...m, text: 'Changed' } : m)) },
            { ...base, messages: base.messages.map(m => (m.number === '002' ? { ...m, selfExplanatory: true } : m)) },
        ];
        for (const other of changed) expect(messageClassesEquivalent(other, base)).toBe(false);
    });
});

describe('form handler (asmsag)', () => {
    const handler = getFormHandler('asmsag')!;

    it('takes the name from the file, not the source', () => {
        expect(handler.declaredName(SERVER_SOURCE)).toEqual([null, null]);
    });

    it('renders the server document as canonical source', () => {
        expect(handler.toSource(fixture('message-class.xml'))).toEqual([SERVER_SOURCE, null]);
    });

    it('validates before building update bodies', () => {
        const [, error] = handler.updateBodies(fixture('message-class.xml'), '{ "description": "D", "messages": [ { "number": "A1", "text": "x" } ] }', LOCK);
        expect(error?.message).toContain('three digits');
    });
});
