/**
 * URL Building Utilities
 *
 * Cross-platform URL construction and path manipulation.
 */

/**
 * Build a complete URL from base, path, and query parameters
 *
 * @param base - Base URL (e.g., "https://example.com")
 * @param path - Path to append (e.g., "/api/endpoint")
 * @param params - Optional query parameters
 * @returns Complete URL string
 *
 * @example
 * buildUrl('https://api.example.com', '/users', { id: '123', active: 'true' })
 * // Returns: 'https://api.example.com/users?id=123&active=true'
 */
export function buildUrl(
    base: string,
    path: string,
    params?: Record<string, string | number>
): string {
    if (!base) {
        throw new Error('Base URL is required');
    }

    // Remove trailing slash from base
    const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;

    // Ensure path starts with slash
    const cleanPath = path.startsWith('/') ? path : `/${path}`;

    // Combine base and path
    const baseUrl = `${cleanBase}${cleanPath}`;

    // If no params, return base URL
    if (!params || Object.keys(params).length === 0) {
        return baseUrl;
    }

    // Build query string
    const queryParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        queryParams.append(key, String(value));
    }

    const queryString = queryParams.toString();
    return queryString ? `${baseUrl}?${queryString}` : baseUrl;
}

/**
 * Join multiple path segments into a single path
 *
 * Handles leading/trailing slashes correctly and removes duplicates.
 *
 * @param segments - Path segments to join
 * @returns Joined path
 *
 * @example
 * joinPath('/api', 'users/', '/123')
 * // Returns: '/api/users/123'
 */
export function joinPath(...segments: string[]): string {
    if (segments.length === 0) {
        return '';
    }

    // Filter out empty segments
    const cleanSegments = segments.filter(s => s && s.length > 0);

    if (cleanSegments.length === 0) {
        return '';
    }

    // Check if the first segment starts with slash
    const startsWithSlash = cleanSegments[0]?.startsWith('/') ?? false;

    // Join segments and normalize slashes
    const joined = cleanSegments
        .map(segment => segment.replace(/^\/+|\/+$/g, '')) // Remove leading and trailing slashes
        .filter(segment => segment.length > 0) // Remove empty segments again
        .join('/');

    // Preserve leading slash if original path had one
    return startsWithSlash ? `/${joined}` : joined;
}
