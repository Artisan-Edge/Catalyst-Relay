/**
 * Unit Tests for ATC runs: customizing, the run body, run status parsing, worklist parsing and
 * summary, and the request sequence runAtc sends (worklist, background run, polls, worklist read).
 *
 * Fixtures (.atc: the XML bodies; *.xml is gitignored) are real responses captured from an
 * S/4HANA Public Cloud system (check variant ABAP_CLOUD_DEVELOPMENT_DEFAULT). The worklist is a
 * transport's, trimmed to one class with an error, a warning and an info plus a CDS view with no findings.
 */

import { describe, it, expect } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { runAtc } from '../../../../core/adt';
import type { AdtRequestor, AtcRunProgress } from '../../../../core/adt';
import type { RequestOptions } from '../../../../client/types';
import { parseAtcCustomizing } from '../../../../core/adt/atc/getAtcCustomizing';
import { buildRunBody } from '../../../../core/adt/atc/startAtcRun';
import { parseAtcRunStatus } from '../../../../core/adt/atc/getAtcRunStatus';
import { parseAtcWorklist, summarizeAtc } from '../../../../core/adt/atc/parseAtcWorklist';

const FIXTURES = path.join(import.meta.dir, '../../../fixtures/atc');
const WORKLIST_ID = '7C1E526434241FD1B98D7294C1754A43';
const RUN_URI = '/sap/bc/adt/atc/runs/7C1E526434241FD1B98D7294C175EA43';

function fixture(name: string): string {
    return fs.readFileSync(path.join(FIXTURES, name), 'utf8');
}

describe('parseAtcCustomizing', () => {
    it('reads the system check variant', () => {
        const [customizing] = parseAtcCustomizing(fixture('customizing.atc'));
        expect(customizing?.systemCheckVariant).toBe('ABAP_CLOUD_DEVELOPMENT_DEFAULT');
        expect(customizing?.properties['ciCheckFlavour']).toBe('true');
    });

    it('has no variant when the system names none', () => {
        const [customizing] = parseAtcCustomizing('<?xml version="1.0"?><atc:customizing xmlns:atc="http://www.sap.com/adt/atc"><properties/></atc:customizing>');
        expect(customizing?.systemCheckVariant).toBeNull();
    });
});

describe('buildRunBody', () => {
    it('lists every URI in one inclusive object set', () => {
        const xml = buildRunBody(['/sap/bc/adt/cts/transportrequests/FVMK900858', '/sap/bc/adt/packages/%24tmp']);
        expect(xml).toContain('<objectSet kind="inclusive">');
        expect(xml).toContain('<adtcore:objectReference adtcore:uri="/sap/bc/adt/cts/transportrequests/FVMK900858"/>');
        expect(xml).toContain('<adtcore:objectReference adtcore:uri="/sap/bc/adt/packages/%24tmp"/>');
    });
});

describe('parseAtcRunStatus', () => {
    it('reports a running run as pending with the phase in process', () => {
        const [status] = parseAtcRunStatus(fixture('runRunning.atc'));
        expect(status).toEqual({ state: 'pending', progress: { status: 'Running', description: 'Check Objects', phase: 'Check Objects' } });
    });

    it('reports a completed run', () => {
        const [status] = parseAtcRunStatus(fixture('runCompleted.atc'));
        expect(status).toEqual({ state: 'completed', progress: { status: 'Completed', description: 'Run Completed' } });
    });

    it('treats a not yet started run as pending', () => {
        const [status] = parseAtcRunStatus('<?xml version="1.0"?><atc:run status="Not Yet Started" xmlns:atc="http://www.sap.com/adt/atc"><atc:progress description="Job not yet started"/><atc:phases/></atc:run>');
        expect(status?.state).toBe('pending');
    });

    it('fails an unknown status without a worklist link, and accepts one with it', () => {
        const [aborted] = parseAtcRunStatus('<?xml version="1.0"?><atc:run status="Aborted" xmlns:atc="http://www.sap.com/adt/atc"><atc:progress description="Run aborted"/></atc:run>');
        expect(aborted?.state).toBe('failed');

        const [linked] = parseAtcRunStatus(fixture('runCompleted.atc').replace('status="Completed"', 'status="Finished"'));
        expect(linked?.state).toBe('completed');
    });

    it('rejects a response that is not a run', () => {
        const [, error] = parseAtcRunStatus('<?xml version="1.0"?><runs:runs xmlns:runs="http://www.sap.com/adt/backgroundruns"/>');
        expect(error?.message).toContain('Unexpected ATC run status response');
    });
});

describe('parseAtcWorklist', () => {
    it('parses objects, findings, positions, tags and the transport verdict', () => {
        const [objects, error] = parseAtcWorklist(fixture('transportWorklist.atc'));
        if (error) throw error;

        const [qe, view] = objects;
        expect(qe).toMatchObject({ type: 'CLAS', name: 'ZBEACON_F70_QE_CL', packageName: 'ZBEACON_F70', author: 'CB9980000091' });
        expect(view).toMatchObject({ type: 'DDLS', name: 'ZSNAP_F70S_007', findings: [] });

        const [error1, warning, info] = qe!.findings;
        expect(error1).toMatchObject({
            priority: 1,
            checkTitle: 'Security Checks for ABAP (CVA)',
            messageTitle: 'Operand LOOKUP_WHERE in statement SELECT poses an SQL injection risk.',
            effectOnTransports: 'blockPriority',
            blocksTransport: true,
            location: { uri: '/sap/bc/adt/oo/classes/zbeacon_f70_qe_cl/source/main', line: 1446, column: 0 },
            tags: { ADD_INFO: 'Data Source: CALL (Procedure)' },
            exemptionKind: '',
            exemptionApproval: '-',
        });
        expect(warning).toMatchObject({ priority: 2, blocksTransport: true });
        expect(info).toMatchObject({ priority: 3, effectOnTransports: 'allowTransports', blocksTransport: false, checkTitle: 'Extended Program Check (SLIN)' });
        expect(info?.messageTitle).toBe('Strings without text elements are not translated: | >= @today|');
        expect(info?.tags).toBeUndefined();
    });

    it('summarizes counts and the release verdict', () => {
        const [objects] = parseAtcWorklist(fixture('transportWorklist.atc'));
        expect(summarizeAtc(objects!)).toEqual({ objects: 2, findings: 3, errors: 1, warnings: 1, infos: 1, blocking: 2, releasable: false });
        expect(summarizeAtc([])).toEqual({ objects: 0, findings: 0, errors: 0, warnings: 0, infos: 0, blocking: 0, releasable: true });
    });

    it('keeps a location without a position as a plain URI', () => {
        const xml = fixture('transportWorklist.atc').replace('source/main#start=1446,0', 'source/main');
        const [objects] = parseAtcWorklist(xml);
        expect(objects![0]!.findings[0]!.location).toEqual({ uri: '/sap/bc/adt/oo/classes/zbeacon_f70_qe_cl/source/main' });
    });
});

describe('runAtc', () => {
    // Answers the customizing, worklist, run and status requests in the order SAP would
    function fakeSap(statuses: string[]): { requestor: AdtRequestor; sent: RequestOptions[] } {
        const sent: RequestOptions[] = [];
        const queue = [...statuses];
        const requestor: AdtRequestor = {
            request: async (options) => {
                sent.push(options);
                if (options.path === '/sap/bc/adt/atc/customizing') return [new Response(fixture('customizing.atc'), { status: 200 }), null];
                if (options.path === '/sap/bc/adt/atc/worklists' && options.method === 'POST') return [new Response(WORKLIST_ID, { status: 200 }), null];
                if (options.path === '/sap/bc/adt/atc/runs') return [new Response('', { status: 201, headers: { location: RUN_URI } }), null];
                if (options.path === RUN_URI) return [new Response(fixture(queue.shift() ?? 'runCompleted.atc'), { status: 200 }), null];
                if (options.path === `/sap/bc/adt/atc/worklists/${WORKLIST_ID}`) return [new Response(fixture('transportWorklist.atc'), { status: 200 }), null];
                return [new Response('unexpected', { status: 500 }), null];
            },
        };
        return { requestor, sent };
    }

    it('starts a background run with the system variant, polls it and reads the last run', async () => {
        const { requestor, sent } = fakeSap(['runRunning.atc', 'runRunning.atc', 'runCompleted.atc']);
        const progress: AtcRunProgress[] = [];

        const [result, error] = await runAtc(requestor, {
            objects: [{ name: 'ZSNAP_F70S_007', extension: 'asddls' }],
            packages: ['$TMP'],
            transports: ['fvmk900858'],
            pollInterval: 1,
            onProgress: update => progress.push(update),
        });
        if (error) throw error;

        expect(result.checkVariant).toBe('ABAP_CLOUD_DEVELOPMENT_DEFAULT');
        expect(result.worklistId).toBe(WORKLIST_ID);
        expect(result.summary).toMatchObject({ objects: 2, blocking: 2, releasable: false });

        const [, createWorklist, start, ...rest] = sent;
        expect(createWorklist?.params).toEqual({ checkVariant: 'ABAP_CLOUD_DEVELOPMENT_DEFAULT' });
        expect(start?.params).toEqual({ worklistId: WORKLIST_ID, clientWait: 'false' });
        expect(start?.body).toContain('adtcore:uri="/sap/bc/adt/ddic/ddl/sources/zsnap_f70s_007"');
        expect(start?.body).toContain('adtcore:uri="/sap/bc/adt/packages/%24tmp"');
        expect(start?.body).toContain('adtcore:uri="/sap/bc/adt/cts/transportrequests/FVMK900858"');
        expect(rest.filter(call => call.path === RUN_URI)).toHaveLength(3);

        const read = rest.at(-1);
        expect(read?.params).toEqual({ usedObjectSet: '99999999999999999999999999999999', includeExemptedFindings: 'false' });

        // Unchanged progress is reported once
        expect(progress.map(update => update.status)).toEqual(['Running', 'Completed']);
    });

    it('uses a named check variant without reading the customizing', async () => {
        const { requestor, sent } = fakeSap([]);
        const [, error] = await runAtc(requestor, { transports: ['FVMK900858'], checkVariant: 'MY_VARIANT', pollInterval: 1 });
        if (error) throw error;
        expect(sent.some(call => call.path === '/sap/bc/adt/atc/customizing')).toBe(false);
        expect(sent[0]?.params).toEqual({ checkVariant: 'MY_VARIANT' });
    });

    it('gives up at the timeout and names the worklist that keeps running', async () => {
        const { requestor } = fakeSap(Array(100).fill('runRunning.atc'));
        const [, error] = await runAtc(requestor, { transports: ['FVMK900858'], pollInterval: 5, timeout: 20 });
        expect(error?.message).toContain('did not finish');
        expect(error?.message).toContain(WORKLIST_ID);
        expect(error?.message).toContain("phase 'Check Objects'");
    });

    it('needs something to check', async () => {
        const { requestor } = fakeSap([]);
        expect((await runAtc(requestor, {}))[1]?.message).toBe('No objects, packages or transports to check');
    });
});
