import { describe, it, expect } from 'vitest';
import { createClient, ok, err } from '../index';

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
});

describe('Result utilities', () => {
    it('ok should create success result', () => {
        const [value, error] = ok(42);
        expect(value).toBe(42);
        expect(error).toBeNull();
    });

    it('err should create error result', () => {
        const testError = new Error('test');
        const [value, error] = err(testError);
        expect(value).toBeNull();
        expect(error).toBe(testError);
    });
});
