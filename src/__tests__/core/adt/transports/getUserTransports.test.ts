/**
 * Unit Tests for getUserTransports
 *
 * Parses a transport-organizer tree fixture (shape captured from a live
 * S/4 system) against a mocked AdtRequestor and checks the query params.
 */

import { describe, it, expect } from 'bun:test';
import { getUserTransports } from '../../../../core/adt/transports/getUserTransports';
import { getUserTransports as clientGetUserTransports } from '../../../../client/methods/discovery/getUserTransports';
import type { AdtRequestor } from '../../../../core/adt';
import type { ClientState } from '../../../../client/types';

interface RecordedRequest {
    method: string;
    path: string;
    params?: Record<string, string | number>;
    headers?: Record<string, string>;
}

function mockRequestor(xml: string): { requestor: AdtRequestor; calls: RecordedRequest[] } {
    const calls: RecordedRequest[] = [];
    const requestor: AdtRequestor = {
        request: async (options) => {
            const call: RecordedRequest = { method: options.method, path: options.path };
            if (options.params) call.params = options.params as Record<string, string | number>;
            if (options.headers) call.headers = options.headers;
            calls.push(call);
            return [new Response(xml, { status: 200 }), null];
        },
    };
    return { requestor, calls };
}

const TREE_XML = `<?xml version="1.0" encoding="utf-8"?>
<tm:root adtcore:name="EBOSCH1" xmlns:tm="http://www.sap.com/cts/adt/tm" xmlns:adtcore="http://www.sap.com/adt/core">
  <tm:workbench tm:category="Workbench">
    <tm:target tm:name="/GADEV/" tm:desc="ZGALLO DEV">
      <tm:modifiable tm:status="Modifiable">
        <tm:request tm:number="N01K957296" tm:parent="" tm:owner="EBOSCH1" tm:desc="SNAP F80: Beacon Hierarchy Updates" tm:type="K" tm:status="D" tm:target="" tm:lastchanged_timestamp="20260727195310">
          <tm:long_desc/>
          <tm:task tm:number="N01K957297" tm:parent="N01K957296" tm:owner="EBOSCH1" tm:desc="SNAP F80: Beacon Hierarchy Updates" tm:type="Development/Correction" tm:status="D"/>
        </tm:request>
      </tm:modifiable>
      <tm:released tm:status="Released (From Last 2 Weeks)">
        <tm:request tm:number="N01K957171" tm:parent="" tm:owner="EBOSCH1" tm:desc="SNAP F72: Beacon Dynamic Hierarchies" tm:type="K" tm:status="R" tm:target="" tm:lastchanged_timestamp="20260720100000"/>
      </tm:released>
    </tm:target>
  </tm:workbench>
  <tm:customizing tm:category="Customizing">
    <tm:target tm:name="/GADEV/" tm:desc="ZGALLO DEV">
      <tm:modifiable tm:status="Modifiable">
        <tm:request tm:number="N01K957300" tm:parent="" tm:owner="EBOSCH1" tm:desc="Beacon: Admin Services" tm:type="W" tm:status="D" tm:target="" tm:lastchanged_timestamp="20260727202723"/>
      </tm:modifiable>
    </tm:target>
  </tm:customizing>
</tm:root>`;

describe('getUserTransports', () => {
    it('parses workbench and customizing requests from the tree', async () => {
        const { requestor, calls } = mockRequestor(TREE_XML);

        const [transports, error] = await getUserTransports(requestor, 'EBOSCH1');
        expect(error).toBeNull();
        expect(transports).toHaveLength(3);

        expect(transports![0]).toEqual({
            id: 'N01K957296',
            description: 'SNAP F80: Beacon Hierarchy Updates',
            owner: 'EBOSCH1',
            type: 'workbench',
            status: 'modifiable',
            target: '/GADEV/',
            targetDescription: 'ZGALLO DEV',
            lastChanged: '20260727195310',
        });
        expect(transports![1]!.status).toBe('released');
        expect(transports![2]).toMatchObject({ id: 'N01K957300', type: 'customizing', status: 'modifiable' });

        // Tasks must not be reported as requests.
        expect(transports!.map(t => t.id)).not.toContain('N01K957297');

        // Default query: both types, both statuses.
        expect(calls[0]!.params).toEqual({ user: 'EBOSCH1', targets: 'true', requestType: 'KW', requestStatus: 'DR' });
    });

    it('applies type and status filters server-side', async () => {
        const { requestor, calls } = mockRequestor(TREE_XML);

        await getUserTransports(requestor, 'EBOSCH1', { type: 'customizing', status: 'modifiable' });
        expect(calls[0]!.params).toEqual({ user: 'EBOSCH1', targets: 'true', requestType: 'W', requestStatus: 'D' });
    });

    it('defaults the user to the session username in the client method', async () => {
        const { requestor, calls } = mockRequestor(TREE_XML);
        const state = { session: { username: 'EBOSCH1' } } as unknown as ClientState;

        const [transports, error] = await clientGetUserTransports(state, requestor, { type: 'workbench' });
        expect(error).toBeNull();
        expect(transports).toHaveLength(3);
        expect(calls[0]!.params).toMatchObject({ user: 'EBOSCH1', requestType: 'K' });
    });

    it('errors when not logged in', async () => {
        const { requestor } = mockRequestor(TREE_XML);
        const state = { session: null } as unknown as ClientState;

        const [transports, error] = await clientGetUserTransports(state, requestor);
        expect(transports).toBeNull();
        expect(error?.message).toBe('Not logged in');
    });
});
