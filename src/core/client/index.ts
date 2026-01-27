/**
 * ADT Client Module
 *
 * Exports the ADTClient interface and createClient factory function.
 */

import type { ClientConfig } from '../../types/config';
import type { Result } from '../../types/result';
import { ok, err } from '../../types/result';
import { clientConfigSchema } from '../../types/config';
import { ADTClientImpl } from './client';
import type { ADTClient } from './client';

export type { ADTClient };

// Create a new ADT client - validates config and returns client instance
export function createClient(config: ClientConfig): Result<ADTClient, Error> {
    // Validate config using Zod schema.
    const validation = clientConfigSchema.safeParse(config);
    if (!validation.success) {
        const issues = validation.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
        return err(new Error(`Invalid client configuration: ${issues}`));
    }

    return ok(new ADTClientImpl(config));
}
