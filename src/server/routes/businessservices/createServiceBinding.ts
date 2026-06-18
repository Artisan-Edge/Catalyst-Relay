/**
 * POST /businessservices/bindings — Create, activate and publish a service binding
 */

import { z } from 'zod';
import type { CreateServiceBindingOptions, ServiceBindingResult } from '../../../core/adt';
import { ApiError } from '../../middleware/error';
import { formatZodError } from '../../utils';
import type { RouteContext } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Request Schema (colocated)
// ─────────────────────────────────────────────────────────────────────────────

export const createServiceBindingRequestSchema = z.object({
    bindingName: z.string().min(1, 'Binding name is required'),
    serviceDefinition: z.string().min(1, 'Service definition is required'),
    package: z.string().min(1, 'Package name is required'),
    description: z.string().optional(),
    bindingType: z.literal('ODATA').optional(),
    bindingVersion: z.literal('V4').optional(),
    transport: z.string().optional(),
    publish: z.boolean().optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Response Type (colocated)
// ─────────────────────────────────────────────────────────────────────────────

export type CreateServiceBindingResponse = ServiceBindingResult;

// ─────────────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────────────

export async function createServiceBindingHandler(c: RouteContext) {
    const body = await c.req.json();

    // Validate request body.
    const validation = createServiceBindingRequestSchema.safeParse(body);
    if (!validation.success) {
        throw new ApiError(
            'VALIDATION_ERROR',
            `Invalid request: ${formatZodError(validation.error)}`,
            400
        );
    }

    const data = validation.data;

    // Transport required for non-temporary packages.
    if (data.package !== '$TMP' && !data.transport) {
        throw new ApiError(
            'TRANSPORT_REQUIRED',
            `Transport required for non-temporary package ${data.package}`,
            400
        );
    }

    // Build options (conditional assignment to satisfy exactOptionalPropertyTypes).
    const options: CreateServiceBindingOptions = {
        bindingName: data.bindingName,
        serviceDefinition: data.serviceDefinition,
        packageName: data.package,
    };
    if (data.description !== undefined) options.description = data.description;
    if (data.bindingType !== undefined) options.bindingType = data.bindingType;
    if (data.bindingVersion !== undefined) options.bindingVersion = data.bindingVersion;
    if (data.transport !== undefined) options.transport = data.transport;
    if (data.publish !== undefined) options.publish = data.publish;

    const client = c.get('client');

    const [result, error] = await client.createServiceBinding(options);

    if (error) {
        throw new ApiError('UNKNOWN_ERROR', error.message, 500);
    }

    return c.json({
        success: true,
        data: result satisfies CreateServiceBindingResponse,
    });
}
