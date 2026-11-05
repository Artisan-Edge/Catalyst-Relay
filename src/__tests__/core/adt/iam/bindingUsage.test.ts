/**
 * Unit Tests for findIamAppsUsingBindings (one scan of customer IAM apps for several bindings)
 *
 * Fixtures were captured on Madiba-Cloud-Dev (2608).
 */

import { describe, it, expect } from 'bun:test';
import { findIamAppsUsingBindings } from '../../../../core/adt/iam/bindingUsage';
import { fixture, freshApp, IAM, recorder, xml } from './iamTestKit';

describe('findIamAppsUsingBindings', () => {
    const search = (refs: Array<[string, string, string?]>): string => `<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">${refs.map(([name, pkg, type]) => `<adtcore:objectReference adtcore:uri="${IAM}/sia6/${name.toLowerCase()}" adtcore:type="${type ?? 'SIA6'}" adtcore:name="${name}" adtcore:packageName="${pkg}"/>`).join('')}</adtcore:objectReferences>`;
    const v2App = (name: string): string => freshApp(name).replace('<sia6:services/>', '<sia6:services><sia6:service><sia6:srvcType>HT</sia6:srvcType><sia6:srvcName>X</sia6:srvcName><sia6:relServiceName>ZB_SRV                             0001</sia6:relServiceName><sia6:relServiceType>IWSV</sia6:relServiceType><sia6:typeText>OData V2</sia6:typeText><sia6:srvcDescription/><sia6:uiadSource/><sia6:transactionCodeSource/></sia6:service></sia6:services>');

    it('reads each customer IAM app once and returns the apps listing any of the bindings', async () => {
        const { requestor, calls } = recorder((call) => {
            if (call.path.endsWith('/search')) return xml(call.params?.['query'] === 'Z*' ? search([['ZSNAP_BC_LEAN2_EXT', 'ZSNAP_BC'], ['ZV2_EXT', 'ZOTHER', 'SIA6/APP']]) : search([['YY1_APP', 'TEST_YY1_DEFAULT']]));
            if (call.path.endsWith('/zsnap_bc_lean2_ext')) return xml(fixture('sia6-lean2.xml'));
            if (call.path.endsWith('/zv2_ext')) return xml(v2App('ZV2_EXT'));
            return xml(freshApp(call.path.split('/').at(-1)!.toUpperCase()));
        });

        const [scan, error] = await findIamAppsUsingBindings(requestor, ['zsnap_bc_mda_sb', 'zb_srv', 'ZNOT_USED']);

        expect(error).toBeNull();
        expect(scan).toEqual({
            usages: [
                { binding: 'ZSNAP_BC_MDA_SB', app: 'ZSNAP_BC_LEAN2_EXT', packageName: 'ZSNAP_BC', serviceType: 'INA1' },
                { binding: 'ZB_SRV', app: 'ZV2_EXT', packageName: 'ZSNAP_BC', serviceType: 'IWSV' },
            ],
            appsScanned: 3,
        });
        expect(calls.filter(c => c.path.endsWith('/search')).map(c => c.params)).toEqual([
            { operation: 'quickSearch', query: 'Z*', maxResults: 10_000, objectType: 'SIA6' },
            { operation: 'quickSearch', query: 'Y*', maxResults: 10_000, objectType: 'SIA6' },
        ]);
        expect(calls.filter(c => c.method === 'GET' && c.path.startsWith(`${IAM}/sia6/`))).toHaveLength(3);
    });

    it('reads only the apps of the given packages and reports how many it read', async () => {
        const { requestor, calls } = recorder((call) => {
            if (call.path.endsWith('/search')) return xml(search([['ZSNAP_BC_LEAN2_EXT', 'ZSNAP_BC'], ['ZOTHER_EXT', 'ZOTHER']]));
            return xml(fixture('sia6-lean2.xml'));
        });

        const [scan] = await findIamAppsUsingBindings(requestor, ['ZSNAP_BC_MDA_SB'], { packages: ['zsnap_bc'], namePatterns: ['ZSNAP*'] });

        expect(scan?.appsScanned).toBe(1);
        expect(calls.filter(c => c.method === 'GET' && c.path.startsWith(`${IAM}/sia6/`)).map(c => c.path)).toEqual([`${IAM}/sia6/zsnap_bc_lean2_ext`]);
    });

    it('reports appsScanned 0 when no app matches', async () => {
        const { requestor } = recorder(() => xml(search([])));

        expect(await findIamAppsUsingBindings(requestor, ['ZB'])).toEqual([{ usages: [], appsScanned: 0 }, null]);
    });

    it('fails when a search hits the result limit (the scan would be incomplete)', async () => {
        const many = Array.from({ length: 10_000 }, (_, i): [string, string] => [`Z${i}`, 'P']);
        const { requestor } = recorder(() => xml(search(many)));

        const [, error] = await findIamAppsUsingBindings(requestor, ['ZB'], { namePatterns: ['Z*'] });

        expect(error?.message).toContain('10000 or more IAM apps match Z*, the search limit');
    });

    it('names the app whose read failed', async () => {
        const { requestor } = recorder((call) => call.path.endsWith('/search') ? xml(search([['ZBAD_EXT', 'P']])) : new Error('ECONNRESET'));

        const [, error] = await findIamAppsUsingBindings(requestor, ['ZB'], { namePatterns: ['Z*'] });

        expect(error?.message).toBe('IAM app ZBAD_EXT: ECONNRESET');
    });
});
