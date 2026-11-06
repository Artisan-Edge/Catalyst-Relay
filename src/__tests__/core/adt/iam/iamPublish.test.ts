/**
 * Unit Tests for the IAM publish wait (SIA6, SIA1, SIA8): stateless, 'p' done, re-post policy
 * (timeout at once, 'u' once then pending, 150 s window, minimum gap), typed errors, status parsing
 *
 * Fixtures were captured on Madiba-Cloud-Dev (2608).
 */

import { describe, it, expect } from 'bun:test';
import { publishIamApp } from '../../../../core/adt/iam/app';
import { publishBusinessCatalog } from '../../../../core/adt/iam/catalog';
import { publishRoleTemplate } from '../../../../core/adt/iam/roleTemplate';
import { IamPublishError, IAM_PUBLISH_MESSAGES, publishAndWait, publishingStatusText } from '../../../../core/adt/iam/publish';
import * as relay from '../../../../index';
import type { IamPublishRequest } from '../../../../core/adt/iam/publish';
import { fixture, IAM, NO_WAIT, publishing, recorder, sequence, xml } from './iamTestKit';

const request: IamPublishRequest = { kind: 'sia6', name: 'ZA', path: `${IAM}/sia6/publish`, params: { application: 'ZA' }, accept: 'application/vnd.sap.adt.iam.publishing+xml', doneStatuses: ['p'] };

describe('package root', () => {
    it('exports IamPublishError but keeps the message parts internal', () => {
        expect(relay.IamPublishError).toBe(IamPublishError);
        expect('IAM_PUBLISH_MESSAGES' in relay).toBe(false);
    });
});

describe('publishingStatusText', () => {
    it('reads the status from any prefix, empty for a self-closing element', () => {
        expect(publishingStatusText(fixture('publish-sia1.xml'), 'sia1')).toBe('p');
        expect(publishingStatusText(fixture('publish-sia8.xml'), 'sia8')).toBe('');
    });

    it('is null for another root, another namespace, no status element, or a message child', () => {
        expect(publishingStatusText('<html><body>Logon</body></html>')).toBeNull();
        expect(publishingStatusText(fixture('publish-sia8.xml'), 'sia6')).toBeNull();
        expect(publishingStatusText('<sia8:publishingStatus xmlns:sia8="http://www.sap.com/iam/sia8"/>', 'sia8')).toBeNull();
        expect(publishingStatusText('<sia8:publishingStatus xmlns:sia8="http://www.sap.com/iam/sia8"><sia8:publishingStatusText/><sia8:message>Role is locked</sia8:message></sia8:publishingStatus>', 'sia8')).toBeNull();
        expect(publishingStatusText('<x><sia8:publishingStatusText xmlns:sia8="http://www.sap.com/iam/sia8"/></x>')).toBeNull();
    });
});

describe('publish wait', () => {
    it('ends on p with a stateless 300 s request', async () => {
        const { requestor, calls } = recorder(() => xml(fixture('publish-sia6.xml')));

        const [status, error] = await publishAndWait(requestor, request);

        expect(error).toBeNull();
        expect(status).toBe('p');
        expect(calls).toHaveLength(1);
        expect(calls[0]!.timeout).toBe(300_000);
        expect(calls[0]!.headers?.['X-sap-adt-sessiontype']).toBe('stateless');
    });

    it('caps the request timeout at the time left before the deadline', async () => {
        const { requestor, calls } = recorder(() => xml(fixture('publish-sia6.xml')));

        await publishAndWait(requestor, request, { requestTimeoutMs: 300_000, deadlineMs: 200_000 });

        expect(calls[0]!.timeout).toBeLessThanOrEqual(200_000);
        expect(calls[0]!.timeout).toBeGreaterThan(199_000);
    });

    it('re-posts right away after a client timeout', async () => {
        const { requestor, calls } = recorder(sequence([() => new Error('Request timeout'), () => xml(fixture('publish-sia6.xml'))]));

        const [status, error] = await publishAndWait(requestor, request, { ...NO_WAIT, retryDelayMs: 60_000 });

        expect(error).toBeNull();
        expect(status).toBe('p');
        expect(calls).toHaveLength(2);
    });

    it('re-posts after a 502, a 503, a 504 or a dropped connection', async () => {
        const { requestor, calls } = recorder(sequence([() => xml('', 502), () => xml('', 503), () => xml('', 504), () => new Error('socket hang up'), () => xml(fixture('publish-sia6.xml'))]));

        const [status, error] = await publishAndWait(requestor, request, NO_WAIT);

        expect(error).toBeNull();
        expect(status).toBe('p');
        expect(calls).toHaveLength(5);
    });

    it('falls back to the default timings for invalid ones (NaN, negative, Infinity)', async () => {
        const { requestor, calls } = recorder(() => xml(fixture('publish-sia6.xml')));

        const [status] = await publishAndWait(requestor, request, { ...NO_WAIT, requestTimeoutMs: Number.NaN, deadlineMs: -1, minPostWindowMs: Infinity });

        expect(status).toBe('p');
        expect(calls[0]!.timeout).toBe(300_000);

        const zero = recorder(() => xml(fixture('publish-sia6.xml')));
        await publishAndWait(zero.requestor, request, { ...NO_WAIT, requestTimeoutMs: 0, deadlineMs: 600_000 });
        expect(zero.calls[0]!.timeout).toBe(300_000);
    });

    it('a deadline of 0 (the caller has no time left) is pending at once, without a POST', async () => {
        const { requestor, calls } = recorder(() => xml(fixture('publish-sia6.xml')));

        const [, error] = await publishAndWait(requestor, request, { ...NO_WAIT, minPostWindowMs: 1, deadlineMs: 0 });

        expect(error).toMatchObject({ failure: 'pending', timedOut: true });
        expect(calls).toHaveLength(0);
    });

    it('re-posts after a dropped connection recognised by its error code (Bun words the message differently)', async () => {
        const withCode = (message: string, code: string): Error => Object.assign(new Error(message), { code });
        const withCause = (code: string): Error => new Error('fetch failed', { cause: Object.assign(new Error('x'), { code }) });
        const { requestor, calls } = recorder(sequence([
            () => withCode('The socket connection was closed unexpectedly', 'ECONNRESET'),
            () => withCode('Broken pipe', 'EPIPE'),
            () => withCause('ETIMEDOUT'),
            () => withCode('aborted', 'ECONNABORTED'),
            () => xml(fixture('publish-sia6.xml')),
        ]));

        const [status, error] = await publishAndWait(requestor, request, NO_WAIT);

        expect(error).toBeNull();
        expect(status).toBe('p');
        expect(calls).toHaveLength(5);
    });

    it("re-posts once after 'u' and succeeds when the second run publishes", async () => {
        const { requestor, calls } = recorder(sequence([() => xml(publishing('sia6', 'u')), () => xml(publishing('sia6', 'p'))]));

        const [status] = await publishAndWait(requestor, request, NO_WAIT);

        expect(status).toBe('p');
        expect(calls).toHaveLength(2);
    });

    it("fails as pending (not timed out) after 'u' twice", async () => {
        const { requestor, calls } = recorder(() => xml(publishing('sia6', 'u')));

        const [, error] = await publishAndWait(requestor, request, NO_WAIT);

        expect(calls).toHaveLength(2);
        expect(error).toBeInstanceOf(IamPublishError);
        expect(error).toMatchObject({ kind: 'sia6', objectName: 'ZA', failure: 'pending', pending: true, timedOut: false, lastStatus: 'u', name: 'IamPublishError' });
        expect(error?.message).toContain(IAM_PUBLISH_MESSAGES.pending);
    });

    it('never starts a POST with less than the window left: pending, timed out', async () => {
        const { requestor, calls } = recorder(() => xml(fixture('publish-sia6.xml')));

        const [, error] = await publishAndWait(requestor, request, { deadlineMs: 149_000 });

        expect(calls).toHaveLength(0);
        expect(error).toMatchObject({ failure: 'pending', pending: true, timedOut: true, lastStatus: null });
        expect(error?.message).toBe(`Publish of IAM app ZA ${IAM_PUBLISH_MESSAGES.pending}: less than 150 s left before the deadline for another attempt; it may still publish`);
    });

    it('stops re-posting after timeouts once the window is gone', async () => {
        let now = 0;
        const realNow = Date.now;
        Date.now = () => now;
        try {
            const { requestor, calls } = recorder(() => {
                now += 120_000;
                return new Error('Request timeout');
            });

            const [, error] = await publishAndWait(requestor, request, { deadlineMs: 400_000, minAttemptDelayMs: 0 });

            // 400 s: POST at 0 (→120), at 120 (→240), then 160 s left ≥ 150, POST (→360), 40 s left: stop
            expect(calls).toHaveLength(3);
            expect(error).toMatchObject({ pending: true, timedOut: true });
        } finally {
            Date.now = realNow;
        }
    });

    it('keeps a minimum gap between attempts', async () => {
        const { requestor, calls } = recorder(sequence([() => new Error('Request timeout'), () => xml(fixture('publish-sia6.xml'))]));
        const started = Date.now();

        await publishAndWait(requestor, request, { ...NO_WAIT, minAttemptDelayMs: 50 });

        expect(calls).toHaveLength(2);
        expect(Date.now() - started).toBeGreaterThanOrEqual(45);
    });

    it('fails definitively on another status (an empty one for an IAM app)', async () => {
        const { requestor } = recorder(() => xml(publishing('sia6', '')));

        const [, error] = await publishAndWait(requestor, request, NO_WAIT);

        expect(error?.message).toBe(`Publish of IAM app ZA ${IAM_PUBLISH_MESSAGES.endedWithStatus} ''`);
        expect(error).toMatchObject({ failure: 'status', pending: false, timedOut: false, lastStatus: '' });
    });

    it('fails definitively on a 200 that is not a publishingStatus (e.g. a logon page), even where an empty status means done', async () => {
        const { requestor } = recorder(() => xml('<html><body>Logon</body></html>'));

        const [, error] = await publishAndWait(requestor, { ...request, doneStatuses: ['p', ''] }, NO_WAIT);

        expect(error?.message).toContain(`Publish of IAM app ZA: ${IAM_PUBLISH_MESSAGES.unexpectedResponse} (no publishingStatus)`);
        expect(error).toMatchObject({ failure: 'response', pending: false });
    });

    it('fails on an HTTP error without re-posting', async () => {
        const { requestor, calls } = recorder(() => xml('<exc:exception xmlns:exc="x"><message>boom</message></exc:exception>', 500));

        const [, error] = await publishAndWait(requestor, request, NO_WAIT);

        expect(error?.message).toContain('Failed to publish IAM app ZA');
        expect(error).toMatchObject({ failure: 'request', pending: false });
        expect(calls).toHaveLength(1);
    });

    it('fails on a request error that is not transient', async () => {
        const { requestor, calls } = recorder(() => new Error('certificate has expired'));

        const [, error] = await publishAndWait(requestor, request, NO_WAIT);

        expect(error?.message).toBe('certificate has expired');
        expect(calls).toHaveLength(1);
    });

    it('publishes an IAM app, a catalog and a role template with their own parameters and headers', async () => {
        const app = recorder(() => xml(fixture('publish-sia6.xml')));
        const catalog = recorder(() => xml(fixture('publish-sia1.xml')));
        const template = recorder(() => xml(fixture('publish-sia8.xml')));

        expect((await publishIamApp(app.requestor, ' za '))[0]).toBe('p');
        expect((await publishBusinessCatalog(catalog.requestor, 'zc'))[0]).toBe('p');
        expect((await publishRoleTemplate(template.requestor, 'zsnap_bc_brt_test'))).toEqual(['', null]);

        expect(app.calls[0]).toMatchObject({ params: { application: 'ZA' }, headers: { 'Accept': 'application/vnd.sap.adt.iam.publishing+xml', 'Content-Type': 'application/vnd.sap.adt.iam.publishing+xml' } });
        expect(catalog.calls[0]).toMatchObject({ path: `${IAM}/sia1/$publish`, params: { businessCatalogID: 'ZC' }, headers: { 'Accept': '*/*' }, timeout: 300_000 });
        expect(catalog.calls[0]!.headers).not.toHaveProperty('Content-Type');
        expect(template.calls[0]).toMatchObject({ path: `${IAM}/sia8/$publish`, params: { brtID: 'ZSNAP_BC_BRT_TEST' }, headers: { Accept: '*/*' }, timeout: 300_000 });
    });

    it('rejects a role template status document with a message child', async () => {
        const { requestor } = recorder(() => xml('<sia1:publishingStatus xmlns:sia1="http://www.sap.com/iam/sia8"><sia1:publishingStatusText/><sia1:messages><sia1:message>E</sia1:message></sia1:messages></sia1:publishingStatus>'));

        const [, error] = await publishRoleTemplate(requestor, 'ZT', NO_WAIT);

        expect(error).toMatchObject({ failure: 'response', kind: 'sia8', objectName: 'ZT' });
    });
});
