/**
 * MDA generator helpers — endpoint, request body, option checks (internal)
 */

import type { Result } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { MdaAppOptions, MdaObjectKind } from './types';

export const MDA_PATH = '/sap/bc/adt/analytics/generators/ui/mda-app';
export const CONTENT_TYPE = 'application/vnd.sap.adt.serverdriven.content.v1+json; framework=generators.v1';
export const ADTCORE_NS = 'http://www.sap.com/adt/core';
// Every generator call is stateless: a stateful context keeps stale existence checks (objects deleted
// since still "already exist", ones just generated may not yet), and generate then holds no enqueues.
export const STATELESS = { 'X-sap-adt-sessiontype': 'stateless' } as const;

const DDLS_PATH = '/sap/bc/adt/ddic/ddl/sources/';
const QUERY_REFERENCE_TYPE = 'QUERY';
const DEFAULT_LANGUAGE = 'EN';
const DEFAULT_LANGUAGE_VERSION = '5';

// Limits from the generator schema (mda-app/schema)
const LIMITS: Array<{ key: keyof MdaAppOptions; label: string; max: number; required: boolean }> = [
    { key: 'queryName', label: 'query', max: 30, required: true },
    { key: 'packageName', label: 'package', max: 30, required: true },
    { key: 'appDescriptor', label: 'app descriptor', max: 32, required: true },
    { key: 'appVariantId', label: 'app variant ID', max: 1024, required: true },
    { key: 'title', label: 'title', max: 255, required: true },
    { key: 'subTitle', label: 'subtitle', max: 255, required: false },
    { key: 'semanticObject', label: 'semantic object', max: 30, required: true },
    { key: 'semanticAction', label: 'semantic action', max: 60, required: true },
    { key: 'serviceDefinition', label: 'service definition', max: 30, required: true },
    { key: 'serviceBinding', label: 'service binding', max: 30, required: true },
    { key: 'iamApp', label: 'IAM app', max: 35, required: false },
];

/** Objects the options name */
export function expectedKinds(options: MdaAppOptions): MdaObjectKind[] {
    const kinds: MdaObjectKind[] = ['appDescriptor', 'appVariant', 'serviceDefinition', 'serviceBinding'];
    return options.iamApp ? [...kinds, 'iamApp'] : kinds;
}

/** Name of each object the options name, as sent */
export function objectNames(options: MdaAppOptions): Record<MdaObjectKind, string> {
    return {
        appDescriptor: options.appDescriptor.toUpperCase(),
        appVariant: options.appVariantId,
        serviceDefinition: options.serviceDefinition.toUpperCase(),
        serviceBinding: options.serviceBinding.toUpperCase(),
        iamApp: options.iamApp?.toUpperCase() ?? '',
    };
}

/** Refuse missing or too-long values before any request */
export function checkMdaOptions(options: MdaAppOptions): Result<void, Error> {
    for (const limit of LIMITS) {
        const value = options[limit.key];
        if (value === undefined && !limit.required) continue;
        if (typeof value !== 'string' || value.trim() === '') return err(new Error(`MDA app generator: ${limit.label} is required`));
        if (value.length > limit.max) return err(new Error(`MDA app generator: ${limit.label} '${value}' is longer than ${limit.max} characters`));
    }
    return ok(undefined);
}

/** Query parameters every generator call takes (content dumps without package) */
export function generatorParams(options: MdaAppOptions): Record<string, string> {
    return {
        referencedObject: `${DDLS_PATH}${options.queryName.toLowerCase()}`,
        package: options.packageName.toUpperCase(),
    };
}

/** The serverdriven content JSON the generator endpoints take */
export function buildMdaContent(options: MdaAppOptions): string {
    const names = objectNames(options);
    const fioriApp: Record<string, string> = {
        appDescriptorId: names.appDescriptor,
        appVariantId: names.appVariant,
        title: options.title,
    };
    if (options.subTitle) fioriApp['subTitle'] = options.subTitle;
    fioriApp['semanticObject'] = options.semanticObject;
    fioriApp['semanticAction'] = options.semanticAction;
    if (options.icon) fioriApp['icon'] = options.icon;

    const content: Record<string, unknown> = {
        metadata: { package: options.packageName.toUpperCase(), masterLanguage: options.masterLanguage ?? DEFAULT_LANGUAGE },
        control: { referenceObjectType: QUERY_REFERENCE_TYPE, abapLanguageVersion: options.abapLanguageVersion ?? DEFAULT_LANGUAGE_VERSION },
        queryName: options.queryName.toUpperCase(),
        fioriApp,
        businessService: { serviceDefinition: names.serviceDefinition, serviceBinding: names.serviceBinding },
    };
    if (options.iamApp) content['cloudIam'] = { iamApp: names.iamApp };
    return JSON.stringify(content);
}
