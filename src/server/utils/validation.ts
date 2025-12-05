import type { ZodError } from 'zod';

// Format Zod validation errors into readable string
export function formatZodError(error: ZodError): string {
    return error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join(', ');
}
