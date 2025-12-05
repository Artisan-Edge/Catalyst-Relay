/**
 * SQL Input Validation
 *
 * Protects against SQL injection attacks in data preview queries.
 */

import type { Result } from '../../types/result';
import { ok, err } from '../../types/result';

/**
 * Custom error class for SQL validation failures
 */
export class SqlValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'SqlValidationError';
    }
}

/**
 * Validate SQL input to prevent injection attacks
 *
 * Checks for:
 * - Dangerous SQL keywords (DROP, DELETE, INSERT, etc.)
 * - Statement terminators followed by new statements
 * - SQL comments
 * - Procedure execution
 * - Union-based injection
 * - System variables
 * - Excessive special characters
 * - Unbalanced quotes
 *
 * @param input - SQL input string to validate
 * @param maxLength - Maximum allowed length (default: 10000)
 * @returns Result tuple with true on success or SqlValidationError on failure
 *
 * @example
 * const [valid, error] = validateSqlInput("SELECT * FROM users WHERE id = 1");
 * if (error) {
 *     console.error('Invalid SQL:', error.message);
 *     return;
 * }
 */
export function validateSqlInput(
    input: string,
    maxLength: number = 10000
): Result<true, SqlValidationError> {
    // Type check
    if (typeof input !== 'string') {
        return err(new SqlValidationError('Input must be a string'));
    }

    // Length check
    if (input.length > maxLength) {
        return err(new SqlValidationError(`Input exceeds maximum length of ${maxLength}`));
    }

    // Dangerous pattern checks
    const dangerousPatterns: Array<{ pattern: RegExp; description: string }> = [
        {
            pattern: /\b(DROP|DELETE|INSERT|UPDATE|ALTER|CREATE|TRUNCATE)\s+/i,
            description: 'DDL/DML keywords (DROP, DELETE, INSERT, etc.)'
        },
        {
            pattern: /;[\s]*\w/,
            description: 'Statement termination followed by another statement'
        },
        {
            pattern: /--[\s]*\w/,
            description: 'SQL comments with content'
        },
        {
            pattern: /\/\*.*?\*\//,
            description: 'Block comments'
        },
        {
            pattern: /\bEXEC(UTE)?\s*\(/i,
            description: 'Procedure execution'
        },
        {
            pattern: /\bSP_\w+/i,
            description: 'Stored procedures'
        },
        {
            pattern: /\bXP_\w+/i,
            description: 'Extended stored procedures'
        },
        {
            pattern: /\bUNION\s+(ALL\s+)?SELECT/i,
            description: 'Union-based injection'
        },
        {
            pattern: /@@\w+/,
            description: 'System variables'
        },
        {
            pattern: /\bDECLARE\s+@/i,
            description: 'Variable declarations'
        },
        {
            pattern: /\bCAST\s*\(/i,
            description: 'Type casting'
        },
        {
            pattern: /\bCONVERT\s*\(/i,
            description: 'Type conversion'
        }
    ];

    for (const { pattern, description } of dangerousPatterns) {
        if (pattern.test(input)) {
            return err(new SqlValidationError(
                `Input contains potentially dangerous SQL pattern: ${description}`
            ));
        }
    }

    // Check for excessive special characters
    const specialCharMatches = input.match(/[;'"\\]/g);
    const specialCharCount = specialCharMatches ? specialCharMatches.length : 0;

    if (specialCharCount > 5) {
        return err(new SqlValidationError('Input contains excessive special characters'));
    }

    // Validate balanced quotes
    const singleQuoteCount = (input.match(/'/g) || []).length;
    if (singleQuoteCount % 2 !== 0) {
        return err(new SqlValidationError('Unbalanced single quotes detected'));
    }

    const doubleQuoteCount = (input.match(/"/g) || []).length;
    if (doubleQuoteCount % 2 !== 0) {
        return err(new SqlValidationError('Unbalanced double quotes detected'));
    }

    return ok(true);
}
