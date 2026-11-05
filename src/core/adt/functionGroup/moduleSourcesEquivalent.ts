/**
 * Function module source comparison
 *
 * ADT generates the FUNCTION statement (the signature) from the module's parameters on read, in
 * its own layout, so whitespace there is no change, nor are the blank lines between it and the body
 * (SAP stores two extra). The body is compared line by line.
 */

import { normalizeContent, normalizeSourceLines } from '../../utils/content';

// Literals and comments make collapsed whitespace unsafe; a signature containing one is compared strictly
const UNSAFE_SIGNATURE = /['`|"]|^\*/m;

/**
 * Whether two function module sources are equal for upsert's `unchanged`
 *
 * @param local - Local source
 * @param remote - Server source
 * @returns true when the signatures differ only in whitespace, and the bodies only in leading blank lines, line ends and trailing blanks
 */
export function moduleSourcesEquivalent(local: string, remote: string): boolean {
    const [localSignature, localBody] = splitSignature(normalizeSourceLines(local));
    const [remoteSignature, remoteBody] = splitSignature(normalizeSourceLines(remote));
    if (localBody !== remoteBody) return false;
    if (localSignature === remoteSignature) return true;
    if (UNSAFE_SIGNATURE.test(localSignature) || UNSAFE_SIGNATURE.test(remoteSignature)) return false;
    return normalizeContent(localSignature) === normalizeContent(remoteSignature);
}

// Lines up to the first one ending in '.' (the FUNCTION statement), then the rest without its leading
// blank lines (SAP stores extra ones after the signature); no '.' means no signature
function splitSignature(source: string): [string, string] {
    const lines = source.split('\n');
    const end = lines.findIndex(line => line.endsWith('.'));
    if (end === -1) return ['', source];
    let bodyStart = end + 1;
    while (bodyStart < lines.length && lines[bodyStart] === '') bodyStart++;
    return [lines.slice(0, end + 1).join('\n'), lines.slice(bodyStart).join('\n')];
}
