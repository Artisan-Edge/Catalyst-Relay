/**
 * Unit Tests for getTransportTargets (client method) against a fake SAP
 */

import { describe, it, expect } from 'bun:test';
import { getTransportTargets } from '../../client/methods/transport';
import type { ClientState } from '../../client/types';
import { fakeSap, loggedIn } from './fakeSap';

const TARGETS_XML = '<?xml version="1.0" encoding="utf-8"?><nameditem:namedItemList xmlns:nameditem="http://www.sap.com/adt/nameditem">'
    + '<nameditem:namedItem><nameditem:name>DEV</nameditem:name><nameditem:description>Development</nameditem:description></nameditem:namedItem>'
    + '<nameditem:namedItem><nameditem:name>LOCAL</nameditem:name><nameditem:description/></nameditem:namedItem>'
    + '</nameditem:namedItemList>';

describe('getTransportTargets', () => {
    it('lists the targets from the value-help', async () => {
        const sap = fakeSap([call => (call.path.includes('/valuehelp/target') ? new Response(TARGETS_XML, { status: 200 }) : null)]);

        const [targets, error] = await getTransportTargets(loggedIn(), sap.requestor);

        expect(error).toBeNull();
        expect(targets).toEqual([
            { name: 'DEV', description: 'Development' },
            { name: 'LOCAL', description: '' },
        ]);
        expect(sap.calls.map(call => call.method)).toEqual(['GET']);
    });

    it('fails without a request when not logged in', async () => {
        const sap = fakeSap();

        const [targets, error] = await getTransportTargets({ session: null } as unknown as ClientState, sap.requestor);

        expect(targets).toBeNull();
        expect(error?.message).toBe('Not logged in');
        expect(sap.calls).toEqual([]);
    });
});
