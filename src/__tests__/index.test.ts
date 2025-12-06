/**
 * Unit Tests for Catalyst-Relay Core Utilities
 *
 * Tests pure functions that don't require SAP connection:
 * - Client creation validation
 * - Result tuple utilities
 * - Client ID parsing
 * - Object type configuration
 */

import { describe, it, expect } from 'bun:test';
import { createClient, ok, err } from '../index';
import {
    parseClientId,
} from '../core';
import {
    getConfigByExtension,
    getConfigByType,
    getAllExtensions,
    getAllTypes,
    isExtensionSupported,
    OBJECT_CONFIG_MAP,
    ObjectTypeLabel,
} from '../core/adt/types';

// =============================================================================
// Client Creation Tests
// =============================================================================

describe('createClient', () => {
    it('should return error for missing url', () => {
        const [client, error] = createClient({
            url: '',
            client: '100',
            auth: { type: 'basic', username: 'user', password: 'pass' },
        });

        expect(client).toBeNull();
        expect(error).toBeInstanceOf(Error);
        expect(error?.message).toContain('url');
    });

    it('should return error for missing client', () => {
        const [client, error] = createClient({
            url: 'https://example.com',
            client: '',
            auth: { type: 'basic', username: 'user', password: 'pass' },
        });

        expect(client).toBeNull();
        expect(error).toBeInstanceOf(Error);
        expect(error?.message).toContain('client');
    });

    it('should return error for missing username in basic auth', () => {
        const [client, error] = createClient({
            url: 'https://example.com',
            client: '100',
            auth: { type: 'basic', username: '', password: 'pass' },
        });

        expect(client).toBeNull();
        expect(error).toBeInstanceOf(Error);
        expect(error?.message).toContain('username');
    });

    it('should return error for missing password in basic auth', () => {
        const [client, error] = createClient({
            url: 'https://example.com',
            client: '100',
            auth: { type: 'basic', username: 'user', password: '' },
        });

        expect(client).toBeNull();
        expect(error).toBeInstanceOf(Error);
        expect(error?.message).toContain('password');
    });

    it('should create client with valid config', () => {
        const [client, error] = createClient({
            url: 'https://example.com',
            client: '100',
            auth: { type: 'basic', username: 'user', password: 'pass' },
        });

        expect(error).toBeNull();
        expect(client).not.toBeNull();
        expect(client?.session).toBeNull();
    });

    it('should create client with optional insecure flag', () => {
        const [client, error] = createClient({
            url: 'https://example.com',
            client: '100',
            auth: { type: 'basic', username: 'user', password: 'pass' },
            insecure: true,
        });

        expect(error).toBeNull();
        expect(client).not.toBeNull();
    });

    it('should create client with optional timeout', () => {
        const [client, error] = createClient({
            url: 'https://example.com',
            client: '100',
            auth: { type: 'basic', username: 'user', password: 'pass' },
            timeout: 60000,
        });

        expect(error).toBeNull();
        expect(client).not.toBeNull();
    });
});

// =============================================================================
// Result Utilities Tests
// =============================================================================

describe('Result utilities', () => {
    describe('ok', () => {
        it('should create success result with value', () => {
            const [value, error] = ok(42);
            expect(value).toBe(42);
            expect(error).toBeNull();
        });

        it('should handle string values', () => {
            const [value, error] = ok('hello');
            expect(value).toBe('hello');
            expect(error).toBeNull();
        });

        it('should handle object values', () => {
            const obj = { foo: 'bar', count: 5 };
            const [value, error] = ok(obj);
            expect(value).toEqual(obj);
            expect(error).toBeNull();
        });

        it('should handle array values', () => {
            const arr = [1, 2, 3];
            const [value, error] = ok(arr);
            expect(value).toEqual(arr);
            expect(error).toBeNull();
        });

        it('should handle null values', () => {
            const [value, error] = ok(null);
            expect(value).toBeNull();
            expect(error).toBeNull();
        });

        it('should handle undefined values', () => {
            const [value, error] = ok(undefined);
            expect(value).toBeUndefined();
            expect(error).toBeNull();
        });
    });

    describe('err', () => {
        it('should create error result', () => {
            const testError = new Error('test');
            const [value, error] = err(testError);
            expect(value).toBeNull();
            expect(error).toBe(testError);
        });

        it('should preserve error message', () => {
            const [value, error] = err(new Error('custom message'));
            expect(value).toBeNull();
            expect(error?.message).toBe('custom message');
        });

        it('should handle custom error types', () => {
            class CustomError extends Error {
                code: string;
                constructor(message: string, code: string) {
                    super(message);
                    this.code = code;
                }
            }
            const customErr = new CustomError('failed', 'E001');
            const [value, error] = err(customErr);
            expect(value).toBeNull();
            expect(error).toBeInstanceOf(CustomError);
            expect((error as CustomError).code).toBe('E001');
        });
    });
});

// =============================================================================
// Client ID Parsing Tests
// =============================================================================

describe('parseClientId', () => {
    it('should parse simple client ID', () => {
        const [result, error] = parseClientId('System-100');
        expect(error).toBeNull();
        expect(result?.systemId).toBe('System');
        expect(result?.clientNumber).toBe('100');
    });

    it('should parse client ID with hyphenated system name', () => {
        const [result, error] = parseClientId('MediaDemo-DM1-200');
        expect(error).toBeNull();
        expect(result?.systemId).toBe('MediaDemo-DM1');
        expect(result?.clientNumber).toBe('200');
    });

    it('should parse client ID with multiple hyphens', () => {
        const [result, error] = parseClientId('My-Complex-System-Name-300');
        expect(error).toBeNull();
        expect(result?.systemId).toBe('My-Complex-System-Name');
        expect(result?.clientNumber).toBe('300');
    });

    it('should return error for empty client ID', () => {
        const [result, error] = parseClientId('');
        expect(result).toBeNull();
        expect(error).toBeInstanceOf(Error);
        expect(error?.message).toContain('required');
    });

    it('should return error for client ID without hyphen', () => {
        const [result, error] = parseClientId('InvalidFormat');
        expect(result).toBeNull();
        expect(error).toBeInstanceOf(Error);
        expect(error?.message).toContain('Invalid client ID format');
    });

    it('should return error for non-numeric client number', () => {
        const [result, error] = parseClientId('System-ABC');
        expect(result).toBeNull();
        expect(error).toBeInstanceOf(Error);
        expect(error?.message).toContain('numeric');
    });

    it('should handle three-digit client numbers', () => {
        const [result, error] = parseClientId('DEV-001');
        expect(error).toBeNull();
        expect(result?.systemId).toBe('DEV');
        expect(result?.clientNumber).toBe('001');
    });
});

// =============================================================================
// Object Type Configuration Tests
// =============================================================================

describe('OBJECT_CONFIG_MAP', () => {
    it('should have all required object types', () => {
        expect(OBJECT_CONFIG_MAP).toHaveProperty('asddls');
        expect(OBJECT_CONFIG_MAP).toHaveProperty('asdcls');
        expect(OBJECT_CONFIG_MAP).toHaveProperty('astabldt');
        expect(OBJECT_CONFIG_MAP).toHaveProperty('aclass');
        expect(OBJECT_CONFIG_MAP).toHaveProperty('asprog');
    });

    it('should have correct CDS view configuration', () => {
        const config = OBJECT_CONFIG_MAP['asddls'];
        expect(config.endpoint).toBe('ddic/ddl/sources');
        expect(config.type).toBe('DDLS/DF');
        expect(config.label).toBe(ObjectTypeLabel.VIEW);
        expect(config.dpEndpoint).toBe('cds');
        expect(config.dpParam).toBe('ddlSourceName');
    });

    it('should have correct Access Control configuration', () => {
        const config = OBJECT_CONFIG_MAP['asdcls'];
        expect(config.endpoint).toBe('acm/dcl/sources');
        expect(config.type).toBe('DCLS/DL');
        expect(config.label).toBe(ObjectTypeLabel.ACCESS_CONTROL);
        expect(config.dpEndpoint).toBeUndefined();
    });

    it('should have correct Table configuration', () => {
        const config = OBJECT_CONFIG_MAP['astabldt'];
        expect(config.endpoint).toBe('ddic/tables');
        expect(config.type).toBe('TABL/DT');
        expect(config.label).toBe(ObjectTypeLabel.TABLE);
        expect(config.dpEndpoint).toBe('ddic');
        expect(config.dpParam).toBe('ddicEntityName');
    });

    it('should have correct Class configuration', () => {
        const config = OBJECT_CONFIG_MAP['aclass'];
        expect(config.endpoint).toBe('oo/classes');
        expect(config.type).toBe('CLAS/OC');
        expect(config.label).toBe(ObjectTypeLabel.CLASS);
        expect(config.dpEndpoint).toBeUndefined();
    });

    it('should have correct Program configuration', () => {
        const config = OBJECT_CONFIG_MAP['asprog'];
        expect(config.endpoint).toBe('programs/programs');
        expect(config.type).toBe('PROG/P');
        expect(config.label).toBe(ObjectTypeLabel.PROGRAM);
        expect(config.dpEndpoint).toBeUndefined();
    });

    it('should have required fields for all configurations', () => {
        for (const [ext, config] of Object.entries(OBJECT_CONFIG_MAP)) {
            expect(config.endpoint).toBeTruthy();
            expect(config.nameSpace).toBeTruthy();
            expect(config.rootName).toBeTruthy();
            expect(config.type).toBeTruthy();
            expect(config.label).toBeTruthy();
            expect(config.extension).toBe(ext);
        }
    });
});

describe('getConfigByExtension', () => {
    it('should return config for valid extension', () => {
        const config = getConfigByExtension('asddls');
        expect(config).not.toBeNull();
        expect(config?.type).toBe('DDLS/DF');
    });

    it('should return null for unknown extension', () => {
        const config = getConfigByExtension('unknown');
        expect(config).toBeNull();
    });

    it('should return correct config for each extension', () => {
        expect(getConfigByExtension('asddls')?.label).toBe('View');
        expect(getConfigByExtension('asdcls')?.label).toBe('Access Control');
        expect(getConfigByExtension('astabldt')?.label).toBe('Table');
        expect(getConfigByExtension('aclass')?.label).toBe('Class');
        expect(getConfigByExtension('asprog')?.label).toBe('ABAP Program');
    });
});

describe('getConfigByType', () => {
    it('should return config for valid ADT type', () => {
        const config = getConfigByType('DDLS/DF');
        expect(config).not.toBeNull();
        expect(config?.extension).toBe('asddls');
    });

    it('should return null for unknown type', () => {
        const config = getConfigByType('UNKNOWN/XX');
        expect(config).toBeNull();
    });

    it('should return correct config for each type', () => {
        expect(getConfigByType('DDLS/DF')?.extension).toBe('asddls');
        expect(getConfigByType('DCLS/DL')?.extension).toBe('asdcls');
        expect(getConfigByType('TABL/DT')?.extension).toBe('astabldt');
        expect(getConfigByType('CLAS/OC')?.extension).toBe('aclass');
        expect(getConfigByType('PROG/P')?.extension).toBe('asprog');
    });
});

describe('getAllExtensions', () => {
    it('should return array of extensions', () => {
        const extensions = getAllExtensions();
        expect(Array.isArray(extensions)).toBe(true);
        expect(extensions.length).toBe(5);
    });

    it('should include all configured extensions', () => {
        const extensions = getAllExtensions();
        expect(extensions).toContain('asddls');
        expect(extensions).toContain('asdcls');
        expect(extensions).toContain('astabldt');
        expect(extensions).toContain('aclass');
        expect(extensions).toContain('asprog');
    });
});

describe('getAllTypes', () => {
    it('should return array of ADT types', () => {
        const types = getAllTypes();
        expect(Array.isArray(types)).toBe(true);
        expect(types.length).toBe(5);
    });

    it('should include all configured types', () => {
        const types = getAllTypes();
        expect(types).toContain('DDLS/DF');
        expect(types).toContain('DCLS/DL');
        expect(types).toContain('TABL/DT');
        expect(types).toContain('CLAS/OC');
        expect(types).toContain('PROG/P');
    });
});

describe('isExtensionSupported', () => {
    it('should return true for supported extensions', () => {
        expect(isExtensionSupported('asddls')).toBe(true);
        expect(isExtensionSupported('asdcls')).toBe(true);
        expect(isExtensionSupported('astabldt')).toBe(true);
        expect(isExtensionSupported('aclass')).toBe(true);
        expect(isExtensionSupported('asprog')).toBe(true);
    });

    it('should return false for unsupported extensions', () => {
        expect(isExtensionSupported('unknown')).toBe(false);
        expect(isExtensionSupported('')).toBe(false);
        expect(isExtensionSupported('ASDDLS')).toBe(false); // case-sensitive
    });

    it('should work as type guard', () => {
        const ext: string = 'asddls';
        if (isExtensionSupported(ext)) {
            // TypeScript should narrow the type here
            const config = OBJECT_CONFIG_MAP[ext];
            expect(config).toBeDefined();
        }
    });
});

// =============================================================================
// Object Type Labels Tests
// =============================================================================

describe('ObjectTypeLabel', () => {
    it('should have all expected labels', () => {
        expect(ObjectTypeLabel.VIEW as string).toBe('View');
        expect(ObjectTypeLabel.ACCESS_CONTROL as string).toBe('Access Control');
        expect(ObjectTypeLabel.TABLE as string).toBe('Table');
        expect(ObjectTypeLabel.CLASS as string).toBe('Class');
        expect(ObjectTypeLabel.PROGRAM as string).toBe('ABAP Program');
    });
});
