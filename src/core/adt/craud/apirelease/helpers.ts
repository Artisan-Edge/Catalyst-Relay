/**
 * API Release helpers — internal utilities for the apirelease module
 *
 * Path/body construction and XML parsing for the SAP apireleases endpoint.
 * Not exported from the adt/ barrel.
 */

import type { Result } from '../../../../types/result';
import { ok, err } from '../../../../types/result';
import { safeParseXml } from '../../../utils/xml';
import type { ApiReleaseStatus, ApiReleaseState, ApiReleaseValidationMessage } from './types';

// CDS DDL sources are the only releasable type this module targets.
const DDLS_ENDPOINT = 'ddic/ddl/sources';

// This module operates exclusively on the C1 (customer / cloud) contract.
const CONTRACT_PATH = 'c1';
const CONTRACT_ELEMENT = 'ars:c1Release';

// Media type for the apirelease resource (GET and PUT). The version is v10 —
// matches what ADT/Eclipse negotiates on the wire (the v6 in the atom-link
// `type` attributes of older responses selects a stale server-side schema).
export const APIRELEASE_MEDIA_TYPE = 'application/vnd.sap.adt.apirelease.v10+xml';

// Content type for the validation-run request body.
export const APIRELEASE_VALIDATION_CONTENT_TYPE = 'application/vnd.sap.adt.apireleasecontractvalidation+xml';

// Accept for the validation run (v1 + v2, as ADT/Eclipse sends).
export const APIRELEASE_VALIDATION_ACCEPT =
    'application/vnd.sap.adt.apireleasecontractvalidation+xml, application/vnd.sap.adt.apireleasecontractvalidation.v2+xml';

/**
 * Build the releasable object ADT URI for a CDS DDL source.
 *
 * @param name - DDLS object name (case-insensitive; lowercased in the URI)
 * @returns ADT URI, e.g. /sap/bc/adt/ddic/ddl/sources/zsnap_f04s_q01
 */
export function buildReleasableUri(name: string): string {
    return `/sap/bc/adt/${DDLS_ENDPOINT}/${name.toLowerCase()}`;
}

/**
 * Build the apireleases base path for an object (URL-encoded object URI).
 *
 * The releasable object URI is embedded as a single encoded path segment.
 *
 * @param name - DDLS object name
 * @returns apireleases path, e.g. /sap/bc/adt/apireleases/%2Fsap%2Fbc%2F...
 */
export function buildApiReleasePath(name: string): string {
    return `/sap/bc/adt/apireleases/${encodeURIComponent(buildReleasableUri(name))}`;
}

/**
 * Path to the C1 contract resource (target of the state-changing PUT).
 */
export function buildContractPath(name: string): string {
    return `${buildApiReleasePath(name)}/${CONTRACT_PATH}`;
}

/**
 * Path to the C1 contract validation run (pre-flight check before PUT).
 */
export function buildValidationRunPath(name: string): string {
    return `${buildContractPath(name)}/validationrun`;
}

/**
 * Build the C1 release request body for a target status.
 *
 * Used for both the validation run (POST) and the state change (PUT).
 *
 * @param status - Target contract status (e.g. RELEASED, NOT_RELEASED)
 * @returns apiRelease XML body
 */
export function buildC1ReleaseBody(status: ApiReleaseStatus): string {
    return `<?xml version="1.0" encoding="UTF-8"?><ars:apiRelease xmlns:ars="http://www.sap.com/adt/ars">
  <ars:c1Release ars:comment="" ars:contract="C1" ars:createAuthValues="false" ars:featureToggle="" ars:useInKeyUserApps="true" ars:useInSAPCloudPlatform="true">
    <ars:status ars:state="${status}"/>
    <ars:useConceptAsSuccessor>false</ars:useConceptAsSuccessor>
    <ars:successors/>
    <ars:successorConceptName/>
  </ars:c1Release>
  <ars:apiCatalogData ars:isAnyAssignmentPossible="false" ars:isAnyContractReleased="false">
    <ars:ApiCatalogs/>
  </ars:apiCatalogData>
</ars:apiRelease>`;
}

// SAP states are a stable, closed set; assert at the parse boundary so unknown
// values still surface to the caller rather than being silently dropped.
function toStatus(state: string): ApiReleaseStatus {
    return state as ApiReleaseStatus;
}

/**
 * Locate the C1 data element (the one carrying contract status), skipping the
 * homonymous element nested inside <ars:behaviour>.
 *
 * The behaviour block also contains an <ars:c1Release> describing allowed
 * operations; it has no <ars:status> child, so we filter on that.
 */
function findContractElement(doc: Document): Element | null {
    const candidates = doc.getElementsByTagName(CONTRACT_ELEMENT);
    for (let i = 0; i < candidates.length; i++) {
        const el = candidates[i];
        if (!el) continue;
        if (el.getElementsByTagName('ars:status').length === 0) continue;
        return el;
    }
    return null;
}

/**
 * Parse an apiRelease document into the current C1 release state.
 *
 * @param xml - apiRelease XML (GET or PUT response)
 * @param fallbackName - Object name to use if the response omits it
 * @returns ApiReleaseState or error
 */
export function parseReleaseState(xml: string, fallbackName: string): Result<ApiReleaseState, Error> {
    const [doc, parseErr] = safeParseXml(xml);
    if (parseErr) return err(parseErr);

    const contract = findContractElement(doc);
    if (!contract) return err(new Error('apiRelease response missing C1 contract element'));

    // The first <ars:status> child is the current state; later ones belong to
    // <ars:stateTransitions>.
    const statusEl = contract.getElementsByTagName('ars:status')[0];
    const state = statusEl?.getAttribute('ars:state');
    if (!state) return err(new Error('apiRelease response missing C1 status'));
    const statusDescription = statusEl?.getAttribute('ars:stateDescription') ?? '';

    // Allowed transitions live under <ars:stateTransitions>.
    const allowedTransitions: ApiReleaseStatus[] = [];
    const transitionsEl = contract.getElementsByTagName('ars:stateTransitions')[0];
    if (transitionsEl) {
        const transitionStatuses = transitionsEl.getElementsByTagName('ars:status');
        for (let i = 0; i < transitionStatuses.length; i++) {
            const transitionState = transitionStatuses[i]?.getAttribute('ars:state');
            if (transitionState) allowedTransitions.push(toStatus(transitionState));
        }
    }

    // Releasable object metadata (name + URI).
    const releasable = doc.getElementsByTagName('ars:releasableObject')[0];
    const name = releasable?.getAttribute('adtcore:name') ?? fallbackName;
    const uri = releasable?.getAttribute('adtcore:uri') ?? buildReleasableUri(fallbackName);

    const result: ApiReleaseState = {
        name,
        uri,
        status: toStatus(state),
        statusDescription,
        released: state === 'RELEASED',
        allowedTransitions,
    };

    const changedBy = contract.getAttribute('adtcore:changedBy');
    if (changedBy) result.changedBy = changedBy;
    const changedAt = contract.getAttribute('adtcore:changedAt');
    if (changedAt) result.changedAt = changedAt;

    return ok(result);
}

/**
 * Parse validation messages from a validation-run response.
 *
 * @param xml - apiRelease validation response
 * @returns Parsed messages (empty array if none / unparseable)
 */
export function parseValidationMessages(xml: string): ApiReleaseValidationMessage[] {
    const [doc, parseErr] = safeParseXml(xml);
    if (parseErr) return [];

    const messages: ApiReleaseValidationMessage[] = [];
    const elements = doc.getElementsByTagName('ars:validationMessage');
    for (let i = 0; i < elements.length; i++) {
        const el = elements[i];
        if (!el) continue;

        const text = el.getAttribute('text');
        if (!text) continue;

        const message: ApiReleaseValidationMessage = {
            severity: mapSeverity(el.getAttribute('type')),
            text,
        };
        const msgid = el.getAttribute('msgid');
        if (msgid) message.msgid = msgid;
        const msgno = el.getAttribute('msgno');
        if (msgno) message.msgno = msgno;

        messages.push(message);
    }

    return messages;
}

/**
 * Filter validation messages down to error-severity entries.
 */
export function collectErrors(messages: ApiReleaseValidationMessage[]): ApiReleaseValidationMessage[] {
    return messages.filter(m => m.severity === 'error');
}

// SAP message types: E = error, A/X = abort/dump, W = warning, others informational.
function mapSeverity(type: string | null): ApiReleaseValidationMessage['severity'] {
    if (type === 'E' || type === 'A' || type === 'X') return 'error';
    if (type === 'W') return 'warning';
    return 'info';
}
