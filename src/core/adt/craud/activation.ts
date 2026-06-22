// ADT Activation — activate ADT objects

import type { Result, AsyncResult } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { ObjectRef } from '../../../types/requests';
import type { AdtRequestor } from '../types';
import { getConfigByExtension } from '../types';
import { extractError, safeParseXml } from '../../utils/xml';
import { debug } from '../../utils/logging';

/**
 * Result of activation operation
 */
export interface ActivationResult {
    name: string;
    extension: string;
    status: 'success' | 'warning' | 'error';
    messages: ActivationMessage[];
}

export interface ActivationMessage {
    severity: 'error' | 'warning' | 'info';
    text: string;
    line?: number;
    column?: number;
}

/**
 * A pre-resolved object reference for activation.
 *
 * Used for objects that aren't source-file-backed (e.g. service bindings) and so
 * can't be resolved through the extension registry.
 */
export interface ActivationReference {
    uri: string;
    type: string;
    name: string;
    extension: string;
}

const MAX_POLL_ATTEMPTS = 30;
const POLL_RETRY_DELAY_MS = 1_000;
// withLongPolling holds the connection open server-side with no socket traffic
// until the run finishes. Use a socket-idle timeout long enough to outlast even
// large batch activations rather than the default 30s, which aborts mid-poll.
const LONG_POLL_TIMEOUT_MS = 3_600_000; // 1 hour
const RUN_ID_REGEX = /\/activation\/runs\/([^?/]+)/;
const BACKGROUND_RUN_MEDIA_TYPE = 'application/vnd.sap.adt.backgroundrun.v1+xml';

export async function activateObjects(
    client: AdtRequestor,
    objects: ObjectRef[]
): AsyncResult<ActivationResult[], Error> {
    if (objects.length === 0) {
        return ok([]);
    }

    // Resolve each object to an activation reference via the extension registry.
    const references: ActivationReference[] = [];
    for (const obj of objects) {
        const config = getConfigByExtension(obj.extension);
        if (!config) return err(new Error(`Unsupported extension: ${obj.extension}`));
        references.push({
            uri: `/sap/bc/adt/${config.endpoint}/${obj.name.toLowerCase()}`,
            type: config.type,
            name: obj.name,
            extension: obj.extension,
        });
    }

    return activateByReferences(client, references);
}

/**
 * Activate a set of pre-resolved object references.
 *
 * Lower-level entry point used by activateObjects() and by callers (e.g. service
 * bindings) that build their own references rather than resolving them via the
 * extension registry.
 *
 * @param client - ADT client
 * @param references - Pre-resolved object references
 * @returns Activation results or error
 */
export async function activateByReferences(
    client: AdtRequestor,
    references: ActivationReference[]
): AsyncResult<ActivationResult[], Error> {
    if (references.length === 0) {
        return ok([]);
    }

    // Build XML request body with object references (supports mixed types).
    const objectRefs = references.map(ref =>
        `<adtcore:objectReference adtcore:uri="${ref.uri}" adtcore:type="${ref.type}" adtcore:name="${ref.name}"/>`
    ).join('\n    ');

    const body = `<?xml version="1.0" encoding="UTF-8"?>
<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">
    ${objectRefs}
</adtcore:objectReferences>`;

    // Step 1: Start the activation run. SAP returns a run ID in the Location header.
    const [startRes, startErr] = await client.request({
        method: 'POST',
        path: '/sap/bc/adt/activation/runs',
        params: {
            'method': 'activate',
            'preauditRequested': 'false',
        },
        headers: {
            'Content-Type': 'application/xml',
            'Accept': BACKGROUND_RUN_MEDIA_TYPE,
        },
        body,
    });
    if (startErr) return err(startErr);
    debug(`Activation run start status: ${startRes.status}`);
    if (!startRes.ok) {
        const errText = await startRes.text();
        return err(new Error(`Activation start failed: ${extractError(errText)}`));
    }

    const location = startRes.headers.get('location');
    if (!location) return err(new Error('Activation start response missing Location header'));

    const runIdMatch = RUN_ID_REGEX.exec(location);
    if (!runIdMatch || !runIdMatch[1]) {
        return err(new Error(`Could not extract run ID from Location header: ${location}`));
    }
    const runId = runIdMatch[1];
    debug(`Activation run ID: ${runId}`);

    // Step 2: Long-poll until the run completes. withLongPolling=true blocks server-side
    // until the run finishes, but some servers may return before completion — retry if so.
    // 4xx responses are terminal (config/protocol errors won't recover by retrying).
    for (let pollAttempt = 1; pollAttempt <= MAX_POLL_ATTEMPTS; pollAttempt++) {
        const [pollRes, pollErr] = await client.request({
            method: 'GET',
            path: `/sap/bc/adt/activation/runs/${runId}`,
            params: { 'withLongPolling': 'true' },
            headers: { 'Accept': BACKGROUND_RUN_MEDIA_TYPE },
            timeout: LONG_POLL_TIMEOUT_MS,
        });
        if (pollErr) return err(pollErr);
        debug(`Activation poll attempt ${pollAttempt} status: ${pollRes.status}`);
        if (pollRes.ok) break;

        if (pollRes.status >= 400 && pollRes.status < 500) {
            const errText = await pollRes.text();
            return err(new Error(`Activation run ${runId} polling rejected (${pollRes.status}): ${extractError(errText)}`));
        }

        if (pollAttempt >= MAX_POLL_ATTEMPTS) {
            const errText = await pollRes.text();
            return err(new Error(`Activation run ${runId} did not complete after ${MAX_POLL_ATTEMPTS} attempts: ${extractError(errText)}`));
        }

        await new Promise(resolve => setTimeout(resolve, POLL_RETRY_DELAY_MS));
    }

    // Step 3: Fetch the completed run's results.
    const [resultsRes, resultsErr] = await client.request({
        method: 'GET',
        path: `/sap/bc/adt/activation/results/${runId}`,
        headers: { 'Accept': 'application/xml' },
    });
    if (resultsErr) return err(resultsErr);
    const resultsText = await resultsRes.text();
    debug(`Activation results status: ${resultsRes.status}`);
    debug(`Activation results body: ${resultsText.substring(0, 500)}`);
    if (!resultsRes.ok) {
        return err(new Error(`Failed to fetch activation results: ${extractError(resultsText)}`));
    }

    const [results, parseErr] = extractActivationErrors(references, resultsText);
    if (parseErr) return err(parseErr);
    return ok(results);
}

// Parse activation response XML for errors
function extractActivationErrors(
    objects: ActivationReference[],
    xml: string,
): Result<ActivationResult[], Error> {
    // Parse XML response.
    const [doc, parseErr] = safeParseXml(xml);
    if (parseErr) { return err(parseErr); }

    // Initialize error map with empty arrays for each object.
    const errorMap: Map<string, ActivationMessage[]> = new Map();
    objects.forEach(obj => errorMap.set(obj.name.toLowerCase(), []));

    // Extract message elements and prepare regex for position parsing.
    const msgElements = doc.getElementsByTagName('msg');
    const startRegex = /#start=(\d+),(\d+)/;

    // Process each message element.
    for (let i = 0; i < msgElements.length; i++) {
        const msg = msgElements[i];
        if (!msg) continue;

        // Skip warning messages (type 'W').
        const type = msg.getAttribute('type');
        if (type === 'W') continue;

        // Extract object description and href for position info.
        const objDescr = msg.getAttribute('objDescr');
        const href = msg.getAttribute('href');
        if (!objDescr || !href) continue;

        // Parse line and column from href.
        let line: number | undefined;
        let column: number | undefined;
        const match = startRegex.exec(href);
        if (match && match[1] && match[2]) {
            line = parseInt(match[1], 10);
            column = parseInt(match[2], 10);
        }
        if (!line || !column) continue;

        // Find matching object by name.
        const matchingObj = objects.find(obj =>
            objDescr.toLowerCase().includes(obj.name.toLowerCase())
        );
        if (!matchingObj) continue;

        // Extract message text elements.
        const shortTextElements = msg.getElementsByTagName('txt');
        for (let j = 0; j < shortTextElements.length; j++) {
            const txt = shortTextElements[j];
            if (!txt) continue;

            const text = txt.textContent;
            if (!text) continue;

            // Build activation message with severity and position.
            const message: ActivationMessage = {
                severity: type === 'E' ? 'error' : 'warning',
                text,
                line,
                column,
            };

            // Add message to object's error list.
            const messages = errorMap.get(matchingObj.name.toLowerCase()) || [];
            messages.push(message);
            errorMap.set(matchingObj.name.toLowerCase(), messages);
        }
    }

    // Build final results with status based on message severity.
    const results: ActivationResult[] = objects.map(obj => {
        const messages = errorMap.get(obj.name.toLowerCase()) || [];
        const hasErrors = messages.some(m => m.severity === 'error');

        return {
            name: obj.name,
            extension: obj.extension,
            status: hasErrors ? 'error' : messages.length > 0 ? 'warning' : 'success',
            messages,
        };
    });

    return ok(results);
}
