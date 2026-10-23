// ADT Syntax Check — check objects for errors and warnings without activation

import type { Result, AsyncResult } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { ObjectRef } from '../../../types/requests';
import type { AdtRequestor } from '../types';
import { getConfigByExtension } from '../types';
import { objectUri } from '../helpers';
import type { ActivationMessage } from './activation';
import { readObject } from './read';
import { extractError, safeParseXml } from '../../utils/xml';
import { debug } from '../../utils/logging';

// Result of syntax check operation
export interface CheckResult {
    name: string;
    extension: string;
    status: 'success' | 'warning' | 'error';
    messages: ActivationMessage[];
}

export async function checkSyntax(
    client: AdtRequestor,
    objects: ObjectRef[]
): AsyncResult<CheckResult[], Error> {
    // Handle empty input.
    if (objects.length === 0) {
        return ok([]);
    }

    // Validate object extension is supported.
    const extension = objects[0]!.extension;
    const config = getConfigByExtension(extension);
    if (!config) return err(new Error(`Unsupported extension: ${extension}`));

    // Verify all objects have same extension for batch check.
    for (const obj of objects) {
        if (obj.extension !== extension) {
            return err(new Error('All objects must have the same extension for batch syntax check'));
        }
    }

    // Form objects: check the saved document, one object per run (DDIC runs cross-post messages).
    if (config.kind === 'form') {
        const results: CheckResult[] = [];
        for (const obj of objects) {
            const [uri, uriErr] = objectUri(config, obj);
            if (uriErr) return err(uriErr);
            const [result, checkErr] = await runCheck(client, [obj], `<chkrun:checkObject adtcore:uri="${uri}" chkrun:version="inactive"/>`);
            if (checkErr) return err(checkErr);
            results.push(...result);
        }
        return ok(results);
    }

    // Read source code for each object.
    const sources: Map<string, string> = new Map();
    for (const obj of objects) {
        const [result, readErr] = await readObject(client, obj);
        if (readErr) return err(new Error(`Failed to read ${obj.name}: ${readErr.message}`));
        sources.set(obj.name.toLowerCase(), result.content);
    }

    // Build check objects with inline source code.
    const checkObjects: string[] = [];
    for (const obj of objects) {
        const [uri, uriErr] = objectUri(config, obj);
        if (uriErr) return err(uriErr);
        const sourceUri = `${uri}/source/main`;
        const content = sources.get(obj.name.toLowerCase()) ?? '';
        const encoded = Buffer.from(content).toString('base64');

        checkObjects.push(`<chkrun:checkObject adtcore:uri="${uri}" chkrun:version="active">
        <chkrun:artifacts>
            <chkrun:artifact chkrun:contentType="text/plain; charset=utf-8" chkrun:uri="${sourceUri}">
                <chkrun:content>${encoded}</chkrun:content>
            </chkrun:artifact>
        </chkrun:artifacts>
    </chkrun:checkObject>`);
    }

    return runCheck(client, objects, checkObjects.join('\n    '));
}

// Post a check run and map its messages onto the objects
async function runCheck(
    client: AdtRequestor,
    objects: ObjectRef[],
    objectRefs: string
): AsyncResult<CheckResult[], Error> {
    const body = `<?xml version="1.0" encoding="UTF-8"?>
<chkrun:checkObjectList xmlns:chkrun="http://www.sap.com/adt/checkrun"
                        xmlns:adtcore="http://www.sap.com/adt/core">
    ${objectRefs}
</chkrun:checkObjectList>`;

    // Execute syntax check request.
    const [response, requestErr] = await client.request({
        method: 'POST',
        path: '/sap/bc/adt/checkruns',
        params: {
            'reporters': 'abapCheckRun',
        },
        headers: {
            'Content-Type': 'application/vnd.sap.adt.checkobjects+xml',
            'Accept': 'application/vnd.sap.adt.checkmessages+xml',
        },
        body,
    });

    // Validate successful response.
    if (requestErr) { return err(requestErr); }
    const text = await response.text();
    debug(`Syntax check response status: ${response.status}`);
    debug(`Syntax check response: ${text.substring(0, 500)}`);
    if (!response.ok) {
        const errorMsg = extractError(text);
        return err(new Error(`Syntax check failed: ${errorMsg}`));
    }

    // Parse check results from response.
    const [results, parseErr] = extractCheckMessages(objects, text);
    if (parseErr) { return err(parseErr); }
    return ok(results);
}

// Parse check run response XML for messages
function extractCheckMessages(
    objects: ObjectRef[],
    xml: string
): Result<CheckResult[], Error> {
    // Parse XML response.
    const [doc, parseErr] = safeParseXml(xml);
    if (parseErr) { return err(parseErr); }

    // Initialize message map with empty arrays for each object.
    const messageMap: Map<string, ActivationMessage[]> = new Map();
    objects.forEach(obj => messageMap.set(obj.name.toLowerCase(), []));

    // Try both namespaced and non-namespaced tag names.
    let msgElements = doc.getElementsByTagName('chkrun:checkMessage');
    if (msgElements.length === 0) {
        msgElements = doc.getElementsByTagName('checkMessage');
    }

    const startRegex = /#start=(\d+),(\d+)/;

    // Process each message element.
    for (let i = 0; i < msgElements.length; i++) {
        const msg = msgElements[i];
        if (!msg) continue;

        // Extract severity from type attribute.
        const type = msg.getAttribute('chkrun:type') ?? msg.getAttribute('type');
        if (!type) continue;

        // Extract URI for position info and object matching.
        const uri = msg.getAttribute('chkrun:uri') ?? msg.getAttribute('uri') ?? '';

        // Parse line and column from URI fragment.
        let line: number | undefined;
        let column: number | undefined;
        const match = startRegex.exec(uri);
        if (match && match[1] && match[2]) {
            line = parseInt(match[1], 10);
            column = parseInt(match[2], 10);
        }

        // Find matching object by name in URI.
        const matchingObj = objects.find(obj =>
            uri.toLowerCase().includes(obj.name.toLowerCase())
        );
        if (!matchingObj) continue;

        // Extract message text from shortText attribute.
        const text = msg.getAttribute('chkrun:shortText') ?? msg.getAttribute('shortText');
        if (!text) continue;

        // Build check message with severity and position.
        const message: ActivationMessage = {
            severity: type === 'E' ? 'error' : type === 'W' ? 'warning' : 'info',
            text,
            ...(line !== undefined && { line }),
            ...(column !== undefined && { column }),
        };

        // Add message to object's list.
        const messages = messageMap.get(matchingObj.name.toLowerCase()) || [];
        messages.push(message);
        messageMap.set(matchingObj.name.toLowerCase(), messages);
    }

    // Build final results with status based on message severity.
    const results: CheckResult[] = objects.map(obj => {
        const messages = messageMap.get(obj.name.toLowerCase()) || [];
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
