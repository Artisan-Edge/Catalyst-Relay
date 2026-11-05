/**
 * Unit Tests for the IAM publish wait (SIA6, SIA1, SIA8): stateless, 'p' done, timeout / transient / 'u' re-post, deadline, other statuses
 *
 * Fixtures were captured on Madiba-Cloud-Dev (2608).
 */

import { describe, it, expect } from 'bun:test';
import { publishIamApp } from '../../../../core/adt/iam/app';
import { publishBusinessCatalog } from '../../../../core/adt/iam/catalog';
import { publishRoleTemplate } from '../../../../core/adt/iam/roleTemplate';
import { publishAndWait, publishingStatusText } from '../../../../core/adt/iam/publish';
import { fixture, IAM, NO_WAIT, publishing, recorder, sequence, xml } from './iamTestKit';

describe('publish wait', () => {
    const request = { path: `${IAM}/sia6/publish`, params: { application: 'ZA' }, accept: 'application/vnd.sap.adt.iam.publishing+xml', label: 'IAM app ZA', doneStatuses: ['p'] };

    it('reads the status from any prefix, and null from a response that is not a publishingStatus', () => {
        expect(publishingStatusText(fixture('publish-sia1.xml'))).toBe('p');
        expect(publishingStatusText(fixture('publish-sia8.xml'))).toBe('');
        expect(publishingStatusText('<html><body>Logon</body></html>')).toBeNull();
    });

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

        await publishAndWait(requestor, request, { requestTimeoutMs: 300_000, deadlineMs: 5_000 });

        expect(calls[0]!.timeout).toBeLessThanOrEqual(5_000);
        expect(calls[0]!.timeout).toBeGreaterThan(4_000);
    });

    it('re-posts after a 502, a 504 or a dropped connection', async () => {
        const { requestor, calls } = recorder(sequence([() => xml('', 502), () => xml('', 504), () => new Error('socket hang up'), () => xml(fixture('publish-sia6.xml'))]));

        const [status, error] = await publishAndWait(requestor, request, NO_WAIT);

        expect(error).toBeNull();
        expect(status).toBe('p');
        expect(calls).toHaveLength(4);
    });

    it('fails on a 200 that is not a publishingStatus (e.g. a logon page), even where an empty status means done', async () => {
        const { requestor } = recorder(() => xml('<html><body>Logon</body></html>'));

        const [, error] = await publishAndWait(requestor, { ...request, doneStatuses: ['p', ''] }, NO_WAIT);

        expect(error?.message).toContain('Publish of IAM app ZA: unexpected response (no publishingStatus)');
    });

    it('re-posts after a client timeout', async () => {
        const { requestor, calls } = recorder(sequence([() => new Error('Request timeout'), () => xml(fixture('publish-sia6.xml'))]));

        const [status, error] = await publishAndWait(requestor, request, NO_WAIT);

        expect(error).toBeNull();
        expect(status).toBe('p');
        expect(calls).toHaveLength(2);
    });

    it('re-posts while SAP reports u (in progress)', async () => {
        const { requestor, calls } = recorder(sequence([() => xml(publishing('sia6', 'u')), () => xml(publishing('sia6', 'u')), () => xml(publishing('sia6', 'p'))]));

        const [status] = await publishAndWait(requestor, request, NO_WAIT);

        expect(status).toBe('p');
        expect(calls).toHaveLength(3);
    });

    it('fails when still in progress at the deadline', async () => {
        const { requestor } = recorder(() => xml(publishing('sia6', 'u')));

        const [, error] = await publishAndWait(requestor, request, { retryDelayMs: 0, deadlineMs: 0 });

        expect(error?.message).toBe('Publish of IAM app ZA still in progress after 0 min');
    });

    it('fails when timeouts run past the deadline', async () => {
        const { requestor } = recorder(() => new Error('Request timeout'));

        const [, error] = await publishAndWait(requestor, request, { retryDelayMs: 0, deadlineMs: 0 });

        expect(error?.message).toBe('Publish of IAM app ZA did not finish after 0 min');
    });

    it('fails on any other status (an empty one for an IAM app)', async () => {
        const { requestor } = recorder(() => xml(publishing('sia6', '')));

        const [, error] = await publishAndWait(requestor, request, NO_WAIT);

        expect(error?.message).toBe("Publish of IAM app ZA ended with status ''");
    });

    it('fails on an HTTP error without re-posting', async () => {
        const { requestor, calls } = recorder(() => xml('<exc:exception xmlns:exc="x"><message>boom</message></exc:exception>', 500));

        const [, error] = await publishAndWait(requestor, request, NO_WAIT);

        expect(error?.message).toContain('Failed to publish IAM app ZA');
        expect(calls).toHaveLength(1);
    });

    it('fails on a request error that is not transient', async () => {
        const { requestor, calls } = recorder(() => new Error('certificate has expired'));

        const [, error] = await publishAndWait(requestor, request, NO_WAIT);

        expect(error?.message).toBe('certificate has expired');
        expect(calls).toHaveLength(1);
    });

    it('publishes an IAM app, a catalog and a role template with their own parameters', async () => {
        const app = recorder(() => xml(fixture('publish-sia6.xml')));
        const catalog = recorder(() => xml(fixture('publish-sia1.xml')));
        const template = recorder(() => xml(fixture('publish-sia8.xml')));

        expect((await publishIamApp(app.requestor, 'za'))[0]).toBe('p');
        expect((await publishBusinessCatalog(catalog.requestor, 'zc'))[0]).toBe('p');
        expect((await publishRoleTemplate(template.requestor, 'zsnap_bc_brt_test'))).toEqual(['', null]);

        expect(app.calls[0]!.params).toEqual({ application: 'ZA' });
        expect(catalog.calls[0]).toMatchObject({ path: `${IAM}/sia1/$publish`, params: { businessCatalogID: 'ZC' }, timeout: 300_000 });
        expect(template.calls[0]).toMatchObject({ path: `${IAM}/sia8/$publish`, params: { brtID: 'ZSNAP_BC_BRT_TEST' }, headers: { Accept: '*/*' }, timeout: 300_000 });
    });
});
