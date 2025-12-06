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
    // Validate base URL is provided.
    if (!base) {
        throw new Error('Base URL is required');
    }

    // Remove trailing slash from base.
    const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;

    // Ensure path starts with slash.
    const cleanPath = path.startsWith('/') ? path : `/${path}`;

    // Combine base and path.
    const baseUrl = `${cleanBase}${cleanPath}`;

    // Return early if no parameters provided.
    if (!params || Object.keys(params).length === 0) {
        return baseUrl;
    }

    // Build query string from parameters.
    const queryParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        queryParams.append(key, String(value));
    }

    // Append query string if present.
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
    // Return early if no segments provided.
    if (segments.length === 0) {
        return '';
    }

    // Filter out empty segments.
    const cleanSegments = segments.filter(s => s && s.length > 0);

    // Return early if all segments were empty.
    if (cleanSegments.length === 0) {
        return '';
    }

    // Preserve leading slash from first segment.
    const startsWithSlash = cleanSegments[0]?.startsWith('/') ?? false;

    // Strip slashes from segments and join with single separator.
    const joined = cleanSegments
        .map(segment => segment.replace(/^\/+|\/+$/g, ''))
        .filter(segment => segment.length > 0)
        .join('/');

    // Add leading slash if original path had one.
    return startsWithSlash ? `/${joined}` : joined;
}
