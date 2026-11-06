/**
 * Cookie management helpers
 */

// skip: cookie names not to store (a stateless response must not replace the stateful context cookie)
export function storeCookies(cookies: Map<string, string>, response: Response, skip?: (name: string) => boolean): void {
    const setCookieHeader = response.headers.get('set-cookie');
    if (!setCookieHeader) return;

    // Parse Set-Cookie header(s) - may be multiple cookies
    // Format: "name=value; Path=/; HttpOnly" or multiple separated
    const cookieStrings = setCookieHeader.split(/,(?=\s*\w+=)/);
    for (const cookieStr of cookieStrings) {
        const match = cookieStr.match(/^([^=]+)=([^;]*)/);
        if (!match || !match[1] || !match[2]) continue;
        const name = match[1].trim();
        if (skip?.(name)) continue;
        cookies.set(name, match[2].trim());
    }
}

export function buildCookieHeader(cookies: Map<string, string>): string | null {
    if (cookies.size === 0) return null;
    return Array.from(cookies.entries())
        .map(([name, value]) => `${name}=${value}`)
        .join('; ');
}
