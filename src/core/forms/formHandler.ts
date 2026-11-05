/**
 * Form Handler — source ↔ ADT document operations, selected by file extension
 *
 * The CRAUD layer only sees source text (ObjectContent.content) and ADT XML; this
 * adapter routes each to the data element, domain, message class or lock object implementation.
 * Sources may start with a UTF-8 BOM; it is dropped before parsing.
 */

import type { Result } from '../../types/result';
import { ok, err } from '../../types/result';
import { stripBom } from '../utils/bom';
import * as ddic from '../ddic';
import * as msag from '../msag';
import * as enqu from '../enqu';
import type { FormHandler, FormObjectMeta, FormUpdateBody } from './types';

interface Codec<T> {
    parse(source: string): Result<T, Error>;
    validate(def: T): Result<void, Error>;
    serialize(def: T): string;
    build(def: T, meta: FormObjectMeta): Result<string, Error>;
    updateBodies(xml: string, def: T, lockHandle: string): Result<FormUpdateBody[], Error>;
    parseXml(xml: string): Result<T, Error>;
    equivalent(local: T, remote: T): boolean;
    name(def: T): string | null;
}

const DOCUMENT_LABEL = 'document';

// Single-document types: one PUT of the merged document.
function singleBody<T>(merge: (xml: string, def: T) => Result<string, Error>) {
    return (xml: string, def: T): Result<FormUpdateBody[], Error> => {
        const [body, mergeErr] = merge(xml, def);
        if (mergeErr) return err(mergeErr);
        return ok([{ label: DOCUMENT_LABEL, body }]);
    };
}

const HANDLERS: Record<string, FormHandler> = {
    asdtel: createHandler({
        parse: ddic.parseDataElement,
        validate: ddic.validateDataElement,
        serialize: ddic.serializeDataElement,
        build: ddic.buildDataElementXml,
        updateBodies: singleBody(ddic.mergeDataElementXml),
        parseXml: ddic.parseDataElementXml,
        equivalent: ddic.dataElementsEquivalent,
        name: def => def.name,
    }),
    asdoma: createHandler({
        parse: ddic.parseDomain,
        validate: ddic.validateDomain,
        serialize: ddic.serializeDomain,
        build: ddic.buildDomainXml,
        updateBodies: singleBody(ddic.mergeDomainXml),
        parseXml: ddic.parseDomainXml,
        equivalent: ddic.domainsEquivalent,
        name: def => def.name,
    }),
    asmsag: createHandler({
        parse: msag.parseMessageClass,
        validate: msag.validateMessageClass,
        serialize: msag.serializeMessageClass,
        build: msag.buildMessageClassXml,
        updateBodies: msag.messageClassUpdateBodies,
        parseXml: msag.parseMessageClassXml,
        equivalent: msag.messageClassesEquivalent,
        name: () => null,
    }),
    asenqu: createHandler({
        parse: enqu.parseLockObject,
        validate: enqu.validateLockObject,
        serialize: enqu.serializeLockObject,
        build: enqu.buildLockObjectXml,
        updateBodies: singleBody(enqu.mergeLockObjectXml),
        parseXml: enqu.parseLockObjectXml,
        equivalent: enqu.lockObjectsEquivalent,
        name: def => def.name,
    }),
};

/**
 * Handler for a form-based extension, or null for source-based ones
 */
export function getFormHandler(extension: string): FormHandler | null {
    return HANDLERS[extension] ?? null;
}

function createHandler<T>(codec: Codec<T>): FormHandler {
    const parse = (source: string): Result<T, Error> => codec.parse(stripBom(source));

    // Parse + validate in one step.
    const load = (source: string): Result<T, Error> => {
        const [def, parseErr] = parse(source);
        if (parseErr) return err(parseErr);
        const [, validateErr] = codec.validate(def);
        if (validateErr) return err(validateErr);
        return ok(def);
    };

    return {
        buildXml(source, meta) {
            const [def, loadErr] = load(source);
            if (loadErr) return err(loadErr);
            return codec.build(def, meta);
        },
        updateBodies(xml, source, lockHandle) {
            const [def, loadErr] = load(source);
            if (loadErr) return err(loadErr);
            return codec.updateBodies(xml, def, lockHandle);
        },
        toSource(xml) {
            const [def, parseErr] = codec.parseXml(xml);
            if (parseErr) return err(parseErr);
            return ok(codec.serialize(def));
        },
        canonical(source) {
            const [def, parseErr] = parse(source);
            if (parseErr) return err(parseErr);
            return ok(codec.serialize(def));
        },
        equivalent(localSource, remoteSource) {
            const [local, localErr] = parse(localSource);
            if (localErr) return err(localErr);
            const [remote, remoteErr] = parse(remoteSource);
            if (remoteErr) return err(remoteErr);
            return ok(codec.equivalent(local, remote));
        },
        declaredName(source) {
            const [def, parseErr] = parse(source);
            if (parseErr) return err(parseErr);
            return ok(codec.name(def));
        },
    };
}
