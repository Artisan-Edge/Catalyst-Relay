/**
 * Form Handler — DSL ↔ ADT document operations, selected by file extension
 *
 * The CRAUD layer only sees DSL text (ObjectContent.content) and ADT XML; this
 * adapter routes each to the data element or domain implementation.
 */

import type { Result } from '../../types/result';
import { ok, err } from '../../types/result';
import type { DdicObjectMeta } from './types';
import { parseDataElement } from './parseDataElement';
import { parseDomain } from './parseDomain';
import { serializeDataElement } from './serializeDataElement';
import { serializeDomain } from './serializeDomain';
import { buildDataElementXml, mergeDataElementXml, parseDataElementXml } from './dataElementXml';
import { buildDomainXml, mergeDomainXml, parseDomainXml } from './domainXml';
import { validateDataElement, validateDomain } from './validate';
import { dataElementsEquivalent, domainsEquivalent } from './equivalent';

export interface FormHandler {
    /** Parse and validate DSL, then build the create document */
    buildXml(source: string, meta: DdicObjectMeta): Result<string, Error>;
    /** Parse and validate DSL, then apply it onto the server document */
    mergeXml(xml: string, source: string): Result<string, Error>;
    /** Server document → canonical DSL */
    toSource(xml: string): Result<string, Error>;
    /** DSL → canonical DSL (for diffs) */
    canonical(source: string): Result<string, Error>;
    /** True when the server's canonical DSL already matches the local DSL */
    equivalent(localSource: string, remoteSource: string): Result<boolean, Error>;
    /** Name declared in the DSL */
    declaredName(source: string): Result<string, Error>;
}

interface Codec<T> {
    parse(source: string): Result<T, Error>;
    validate(def: T): Result<void, Error>;
    serialize(def: T): string;
    build(def: T, meta: DdicObjectMeta): Result<string, Error>;
    merge(xml: string, def: T): Result<string, Error>;
    parseXml(xml: string): Result<T, Error>;
    equivalent(local: T, remote: T): boolean;
    name(def: T): string;
}

const HANDLERS: Record<string, FormHandler> = {
    asdtel: createHandler({
        parse: parseDataElement,
        validate: validateDataElement,
        serialize: serializeDataElement,
        build: buildDataElementXml,
        merge: mergeDataElementXml,
        parseXml: parseDataElementXml,
        equivalent: dataElementsEquivalent,
        name: def => def.name,
    }),
    asdoma: createHandler({
        parse: parseDomain,
        validate: validateDomain,
        serialize: serializeDomain,
        build: buildDomainXml,
        merge: mergeDomainXml,
        parseXml: parseDomainXml,
        equivalent: domainsEquivalent,
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
    // Parse + validate in one step.
    const load = (source: string): Result<T, Error> => {
        const [def, parseErr] = codec.parse(source);
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
        mergeXml(xml, source) {
            const [def, loadErr] = load(source);
            if (loadErr) return err(loadErr);
            return codec.merge(xml, def);
        },
        toSource(xml) {
            const [def, parseErr] = codec.parseXml(xml);
            if (parseErr) return err(parseErr);
            return ok(codec.serialize(def));
        },
        canonical(source) {
            const [def, parseErr] = codec.parse(source);
            if (parseErr) return err(parseErr);
            return ok(codec.serialize(def));
        },
        equivalent(localSource, remoteSource) {
            const [local, localErr] = codec.parse(localSource);
            if (localErr) return err(localErr);
            const [remote, remoteErr] = codec.parse(remoteSource);
            if (remoteErr) return err(remoteErr);
            return ok(codec.equivalent(local, remote));
        },
        declaredName(source) {
            const [def, parseErr] = codec.parse(source);
            if (parseErr) return err(parseErr);
            return ok(codec.name(def));
        },
    };
}
