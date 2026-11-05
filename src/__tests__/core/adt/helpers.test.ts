/**
 * Unit Tests for the 406/415 → "not supported on this SAP release" mapping
 *
 * ADT answers 406/415 when a release does not know a vendor media type (fincludes.v2,
 * lockobjects.v1, blues.v1, abapunit result v2, textelements v1). It also answers 406 for
 * invalid content, which must keep SAP's own message.
 */

import { describe, it, expect } from 'bun:test';
import { mediaTypeError } from '../../../core/adt/helpers';
import { createObject } from '../../../core/adt/craud/create';
import { readTextElements } from '../../../core/adt/textelements/readTextElements';
import type { AdtRequestor } from '../../../core/adt';

const NOT_ACCEPTABLE = '<?xml version="1.0" encoding="utf-8"?><exc:exception xmlns:exc="http://www.sap.com/abapxml/types/communicationframework"><namespace id="com.sap.adt"/><type id="ExceptionResourceNotAcceptable"/><message lang="EN">The message content is not acceptable.</message></exc:exception>';
const INVALID_CONTENT = '<?xml version="1.0" encoding="utf-8"?><exc:exception xmlns:exc="http://www.sap.com/abapxml/types/communicationframework"><namespace id="com.sap.adt"/><type id="ExceptionResourceInvalidData"/><message lang="EN">Text symbol 001 is too long</message></exc:exception>';
const TYPE = 'application/vnd.sap.adt.functions.fincludes.v2+xml';

describe('mediaTypeError', () => {
    it('maps 415 to an unsupported-release error naming the media type', () => {
        const error = mediaTypeError(415, '', TYPE, 'Failed to create X');
        expect(error?.message).toBe(`Failed to create X: not supported on this SAP release — it does not accept ${TYPE} (HTTP 415)`);
    });

    it("maps 406 ResourceNotAcceptable (and a bare 406) but keeps SAP's text", () => {
        expect(mediaTypeError(406, NOT_ACCEPTABLE, TYPE, 'Op')?.message).toContain('not supported on this SAP release');
        expect(mediaTypeError(406, NOT_ACCEPTABLE, TYPE, 'Op')?.message).toContain('(SAP: The message content is not acceptable.)');
        expect(mediaTypeError(406, '', TYPE, 'Op')?.message).toContain('not supported on this SAP release');
    });

    it('leaves a 406 about invalid content and other statuses alone', () => {
        expect(mediaTypeError(406, INVALID_CONTENT, TYPE, 'Op')).toBeNull();
        expect(mediaTypeError(400, NOT_ACCEPTABLE, TYPE, 'Op')).toBeNull();
        expect(mediaTypeError(500, '', TYPE, 'Op')).toBeNull();
    });
});

function answering(status: number, body: string): AdtRequestor {
    return { request: async () => [new Response(body, { status }), null] };
}

describe('unsupported media types in requests', () => {
    it('reports a function group include create on an older release', async () => {
        const [, error] = await createObject(answering(415, ''), { name: 'LZFOOF01', extension: 'asfinc', container: 'ZFOO', content: '' }, '$TMP', undefined, 'me');
        expect(error?.message).toContain(`not supported on this SAP release — it does not accept ${TYPE}`);
    });

    it('reports a number range object create (blues.v1)', async () => {
        const [, error] = await createObject(answering(415, ''), { name: 'ZNRO', extension: 'asnrob', content: '{}' }, '$TMP', undefined, 'me');
        expect(error?.message).toContain('application/vnd.sap.adt.blues.v1+xml');
    });

    it('reports a lock object create (lockobjects.v1)', async () => {
        const source = "@EndUserText.label: 'L'\ndefine lock object ezfoo {\n  primary table : zfoo lock mode E;\n  lock parameters {\n    mandt : zfoo.mandt;\n  }\n}\n";
        const [, error] = await createObject(answering(406, NOT_ACCEPTABLE), { name: 'EZFOO', extension: 'asenqu', content: source }, '$TMP', undefined, 'me');
        expect(error?.message).toContain('application/vnd.sap.adt.lockobjects.v1+xml');
    });

    it('reports text elements on a release without them', async () => {
        const [, error] = await readTextElements(answering(406, NOT_ACCEPTABLE), { kind: 'program', name: 'ZFOO' }, ['symbols']);
        expect(error?.message).toContain('application/vnd.sap.adt.textelements.symbols.v1');
    });
});
