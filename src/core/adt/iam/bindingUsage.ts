/**
 * IAM Binding Usage — which IAM apps list given service bindings
 *
 * No ADT endpoint answers this: where-used on a binding is empty and the deletion check counts no
 * references, yet deleting an InA binding silently strips its INA1 row from every IAM app. So the
 * customer IAM apps are listed by name pattern and each one is read once for all bindings.
 */

import type { AsyncResult } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { AdtRequestor } from '../types';
import type { FindIamAppsUsingBindingsOptions, IamAppBindingUsage, IamBindingUsageScan } from './types';
import { safeParseXml } from '../../utils/xml';
import { mapLimited } from '../../utils/concurrency';
import { checkResponse } from '../helpers';
import { ADTCORE_NS } from './helpers';
import { readIamApp } from './app';
import { splitServiceName } from './serviceName';

const SEARCH_PATH = '/sap/bc/adt/repository/informationsystem/search';
const DEFAULT_NAME_PATTERNS = ['Z*', 'Y*'];
const MAX_RESULTS = 10_000;
const SIA6_TYPE = 'SIA6';

interface AppRef {
    name: string;
    packageName: string;
}

/**
 * IAM apps whose Services tab lists any of the bindings (any service type), in one scan.
 *
 * @param client - ADT client
 * @param bindingNames - Service binding names
 * @param options - Package filter and app name patterns (default Z*, Y*)
 * @returns Matches (one per app and binding) and the number of apps read, or error
 */
export async function findIamAppsUsingBindings(
    client: AdtRequestor,
    bindingNames: string[],
    options: FindIamAppsUsingBindingsOptions = {}
): AsyncResult<IamBindingUsageScan, Error> {
    const bindings = new Set(bindingNames.map(name => splitServiceName(name).name));
    if (bindings.size === 0) return ok({ usages: [], appsScanned: 0 });
    const packages = options.packages?.map(name => name.toUpperCase());

    const [apps, listErr] = await listIamApps(client, options.namePatterns ?? DEFAULT_NAME_PATTERNS);
    if (listErr) return err(listErr);
    const candidates = packages ? apps.filter(app => packages.includes(app.packageName.toUpperCase())) : apps;

    const [matches, readErr] = await mapLimited(candidates, async (candidate): AsyncResult<IamAppBindingUsage[], Error> => {
        const [app, appErr] = await readIamApp(client, candidate.name);
        if (appErr) return err(appErr.message.includes(candidate.name) ? appErr : new Error(`IAM app ${candidate.name}: ${appErr.message}`));
        if (!app) return ok([]);
        return ok(app.services
            .filter(service => bindings.has(service.name))
            .map(service => ({ binding: service.name, app: app.name, packageName: app.packageName || candidate.packageName, serviceType: service.type })));
    });
    if (readErr) return err(readErr);
    return ok({ usages: matches.flat(), appsScanned: candidates.length });
}

// Quick search per pattern, deduplicated by name; a result list at the limit would be incomplete.
async function listIamApps(client: AdtRequestor, patterns: string[]): AsyncResult<AppRef[], Error> {
    const byName = new Map<string, AppRef>();
    for (const pattern of patterns) {
        const [response, requestErr] = await client.request({
            method: 'GET',
            path: SEARCH_PATH,
            params: { operation: 'quickSearch', query: pattern, maxResults: MAX_RESULTS, objectType: SIA6_TYPE },
            headers: { 'Accept': 'application/xml' },
        });
        const [text, checkErr] = await checkResponse(response, requestErr, `Failed to list IAM apps matching ${pattern}`);
        if (checkErr) return err(checkErr);

        const [doc, parseErr] = safeParseXml(text);
        if (parseErr) return err(parseErr);
        const refs = doc.getElementsByTagNameNS(ADTCORE_NS, 'objectReference');
        if (refs.length >= MAX_RESULTS) return err(new Error(`${refs.length} or more IAM apps match ${pattern}, the search limit; narrow the name patterns so the scan is complete`));
        for (let i = 0; i < refs.length; i++) {
            const ref = refs[i];
            if (!ref || !(ref.getAttributeNS(ADTCORE_NS, 'type') ?? '').startsWith(SIA6_TYPE)) continue;
            const name = ref.getAttributeNS(ADTCORE_NS, 'name') ?? '';
            if (name) byName.set(name, { name, packageName: ref.getAttributeNS(ADTCORE_NS, 'packageName') ?? '' });
        }
    }
    return ok([...byName.values()]);
}
