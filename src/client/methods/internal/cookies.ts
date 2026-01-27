/**
 * Cookie management helpers
 */

export function storeCookies(cookies: Map<string, string>, response: Response): void {
    const setCookieHeader = response.headers.get('set-cookie');
    if (!setCookieHeader) return;

    // Parse Set-Cookie header(s) - may be multiple cookies
    // Format: "name=value; Path=/; HttpOnly" or multiple separated
    const cookieStrings = setCookieHeader.split(/,(?=\s*\w+=)/);
    for (const cookieStr of cookieStrings) {
        const match = cookieStr.match(/^([^=]+)=([^;]*)/);
        if (match && match[1] && match[2]) {
            cookies.set(match[1].trim(), match[2].trim());
        }
    }
}

export function buildCookieHeader(cookies: Map<string, string>): string | null {
    if (cookies.size === 0) return null;
    return Array.from(cookies.entries())
        .map(([name, value]) => `${name}=${value}`)
        .join('; ');
}
