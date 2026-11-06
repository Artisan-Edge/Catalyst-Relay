/**
 * Cookie management helpers
 */

// skip: cookie names not to store (a stateless response must not replace the stateful context cookie)
export function storeCookies(cookies: Map<string, string>, response: Response, skip?: (name: string) => boolean): void {
    for (const cookieStr of setCookieStrings(response.headers)) {
        const match = cookieStr.match(/^([^=]+)=([^;]*)/);
        if (!match || !match[1] || !match[2]) continue;
        const name = match[1].trim();
        if (skip?.(name)) continue;
        cookies.set(name, match[2].trim());
    }
}

// One string per Set-Cookie header. Without getSetCookie() the joined header is split before each `name=`
// (names may contain '-', e.g. sap-contextid; the comma in an Expires date is not followed by one)
function setCookieStrings(headers: Headers): string[] {
    if (typeof headers.getSetCookie === 'function') return headers.getSetCookie();
    const joined = headers.get('set-cookie');
    return joined ? joined.split(/,(?=\s*[^;,=\s]+=)/) : [];
}

export function buildCookieHeader(cookies: Map<string, string>): string | null {
    if (cookies.size === 0) return null;
    return Array.from(cookies.entries())
        .map(([name, value]) => `${name}=${value}`)
        .join('; ');
}
