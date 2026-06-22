/**
 * Unit Tests for API Release helpers
 *
 * Tests pure path/body construction and XML parsing for the apireleases
 * endpoint (C1 contract on CDS DDL sources):
 * - Releasable URI / apireleases path construction (encoding + lowercasing)
 * - Contract and validation-run path construction
 * - C1 release request body construction
 * - Release-state parsing (skipping the behaviour-block c1Release)
 * - Validation-message parsing and severity mapping
 */

import { describe, it, expect } from 'bun:test';
import {
    buildReleasableUri,
    buildApiReleasePath,
    buildContractPath,
    buildValidationRunPath,
    buildC1ReleaseBody,
    parseReleaseState,
    parseValidationMessages,
    collectErrors,
} from '../../../../../core/adt/craud/apirelease/helpers';

// =============================================================================
// Path / Body Construction
// =============================================================================

describe('buildReleasableUri', () => {
    it('lowercases the object name', () => {
        expect(buildReleasableUri('ZSNAP_F04S_Q01')).toBe(
            '/sap/bc/adt/ddic/ddl/sources/zsnap_f04s_q01'
        );
    });
});

describe('buildApiReleasePath', () => {
    it('URL-encodes the releasable URI as a single segment', () => {
        expect(buildApiReleasePath('ZSNAP_F04S_Q01')).toBe(
            '/sap/bc/adt/apireleases/%2Fsap%2Fbc%2Fadt%2Fddic%2Fddl%2Fsources%2Fzsnap_f04s_q01'
        );
    });
});

describe('buildContractPath / buildValidationRunPath', () => {
    it('appends the C1 contract segment', () => {
        expect(buildContractPath('ZSNAP_F04S_Q01')).toBe(
            '/sap/bc/adt/apireleases/%2Fsap%2Fbc%2Fadt%2Fddic%2Fddl%2Fsources%2Fzsnap_f04s_q01/c1'
        );
    });

    it('appends the validationrun segment', () => {
        expect(buildValidationRunPath('ZSNAP_F04S_Q01')).toBe(
            '/sap/bc/adt/apireleases/%2Fsap%2Fbc%2Fadt%2Fddic%2Fddl%2Fsources%2Fzsnap_f04s_q01/c1/validationrun'
        );
    });
});

describe('buildC1ReleaseBody', () => {
    it('embeds the target status', () => {
        const body = buildC1ReleaseBody('RELEASED');
        expect(body).toContain('<ars:status ars:state="RELEASED"/>');
        expect(body).toContain('ars:contract="C1"');
    });

    it('supports NOT_RELEASED', () => {
        expect(buildC1ReleaseBody('NOT_RELEASED')).toContain(
            '<ars:status ars:state="NOT_RELEASED"/>'
        );
    });
});

// =============================================================================
// Release-State Parsing
// =============================================================================

const RELEASED_XML = `<?xml version="1.0" encoding="UTF-8"?><ars:apiRelease xmlns:ars="http://www.sap.com/adt/ars">
  <ars:releasableObject xmlns:adtcore="http://www.sap.com/adt/core" adtcore:uri="/sap/bc/adt/ddic/ddl/sources/zsnap_f04s_q01" adtcore:type="DDLS/DF" adtcore:name="ZSNAP_F04S_Q01"/>
  <ars:behaviour ars:create="true" ars:commentEnabled="false">
    <ars:c1Release ars:create="false" ars:read="true" ars:update="true" ars:delete="true"/>
  </ars:behaviour>
  <ars:c1Release xmlns:adtcore="http://www.sap.com/adt/core" ars:contract="C1" adtcore:name="sap_..._C1" adtcore:changedAt="2026-06-22T00:00:00Z" adtcore:changedBy="EBOSCH">
    <ars:status ars:state="RELEASED" ars:stateDescription="Released"/>
    <ars:stateTransitions>
      <ars:status ars:state="RELEASED" ars:stateDescription="Released"/>
      <ars:status ars:state="DEPRECATED" ars:stateDescription="Deprecated"/>
      <ars:status ars:state="NOT_RELEASED" ars:stateDescription="Not Released"/>
    </ars:stateTransitions>
  </ars:c1Release>
</ars:apiRelease>`;

const NOT_RELEASED_XML = `<?xml version="1.0" encoding="UTF-8"?><ars:apiRelease xmlns:ars="http://www.sap.com/adt/ars">
  <ars:releasableObject xmlns:adtcore="http://www.sap.com/adt/core" adtcore:uri="/sap/bc/adt/ddic/ddl/sources/zsnap_f04s_q01" adtcore:type="DDLS/DF" adtcore:name="ZSNAP_F04S_Q01"/>
  <ars:c1Release xmlns:adtcore="http://www.sap.com/adt/core" ars:contract="C1">
    <ars:status ars:state="NOT_RELEASED" ars:stateDescription="Not Released"/>
    <ars:stateTransitions>
      <ars:status ars:state="NOT_RELEASED" ars:stateDescription="Not Released"/>
      <ars:status ars:state="RELEASED" ars:stateDescription="Released"/>
    </ars:stateTransitions>
  </ars:c1Release>
</ars:apiRelease>`;

describe('parseReleaseState', () => {
    it('parses a released contract, ignoring the behaviour-block c1Release', () => {
        const [state, error] = parseReleaseState(RELEASED_XML, 'ZSNAP_F04S_Q01');
        expect(error).toBeNull();
        if (!state) throw new Error('expected state');

        expect(state.name).toBe('ZSNAP_F04S_Q01');
        expect(state.uri).toBe('/sap/bc/adt/ddic/ddl/sources/zsnap_f04s_q01');
        expect(state.status).toBe('RELEASED');
        expect(state.statusDescription).toBe('Released');
        expect(state.released).toBe(true);
        expect(state.changedBy).toBe('EBOSCH');
        expect(state.changedAt).toBe('2026-06-22T00:00:00Z');
        // Current status is excluded from transitions only if SAP omits it; here it lists all three.
        expect(state.allowedTransitions).toEqual(['RELEASED', 'DEPRECATED', 'NOT_RELEASED']);
    });

    it('parses a not-released contract without changed-by metadata', () => {
        const [state, error] = parseReleaseState(NOT_RELEASED_XML, 'ZSNAP_F04S_Q01');
        expect(error).toBeNull();
        if (!state) throw new Error('expected state');

        expect(state.status).toBe('NOT_RELEASED');
        expect(state.released).toBe(false);
        expect(state.changedBy).toBeUndefined();
        expect(state.allowedTransitions).toEqual(['NOT_RELEASED', 'RELEASED']);
    });

    it('falls back to the supplied name when the response omits it', () => {
        const xml = `<?xml version="1.0" encoding="UTF-8"?><ars:apiRelease xmlns:ars="http://www.sap.com/adt/ars">
  <ars:c1Release ars:contract="C1"><ars:status ars:state="RELEASED"/></ars:c1Release>
</ars:apiRelease>`;
        const [state, error] = parseReleaseState(xml, 'ZFALLBACK');
        expect(error).toBeNull();
        expect(state?.name).toBe('ZFALLBACK');
        expect(state?.uri).toBe('/sap/bc/adt/ddic/ddl/sources/zfallback');
    });

    it('errors when no contract element carries a status', () => {
        const xml = `<?xml version="1.0" encoding="UTF-8"?><ars:apiRelease xmlns:ars="http://www.sap.com/adt/ars">
  <ars:behaviour><ars:c1Release ars:create="true"/></ars:behaviour>
</ars:apiRelease>`;
        const [state, error] = parseReleaseState(xml, 'ZSNAP_F04S_Q01');
        expect(state).toBeNull();
        expect(error).not.toBeNull();
    });
});

// =============================================================================
// Validation-Message Parsing
// =============================================================================

const WARNINGS_XML = `<?xml version="1.0" encoding="UTF-8"?><ars:apiRelease xmlns:ars="http://www.sap.com/adt/ars">
  <ars:validationMessages>
    <ars:validationMessage type="W" text="Referenced data element KTOPL in parameter P_CHARTOFACCOUNTS is not released." msgid="ARS_DEP_CHECKS" msgno="017"/>
    <ars:validationMessage type="W" text="Do not delete release contract if already shipped." msgid="ARS_STATE_HANDLER" msgno="125"/>
  </ars:validationMessages>
</ars:apiRelease>`;

describe('parseValidationMessages', () => {
    it('parses warning messages with msgid/msgno', () => {
        const messages = parseValidationMessages(WARNINGS_XML);
        expect(messages.length).toBe(2);
        expect(messages[0]?.severity).toBe('warning');
        expect(messages[0]?.msgid).toBe('ARS_DEP_CHECKS');
        expect(messages[0]?.msgno).toBe('017');
        expect(messages[0]?.text).toContain('KTOPL');
    });

    it('maps SAP message types to severities', () => {
        const xml = `<?xml version="1.0" encoding="UTF-8"?><ars:apiRelease xmlns:ars="http://www.sap.com/adt/ars">
  <ars:validationMessages>
    <ars:validationMessage type="E" text="hard error"/>
    <ars:validationMessage type="W" text="warning"/>
    <ars:validationMessage type="I" text="info"/>
  </ars:validationMessages>
</ars:apiRelease>`;
        const messages = parseValidationMessages(xml);
        expect(messages.map(m => m.severity)).toEqual(['error', 'warning', 'info']);
    });

    it('returns an empty array for unparseable XML', () => {
        expect(parseValidationMessages('not xml at all <<<')).toEqual([]);
    });
});

describe('collectErrors', () => {
    it('keeps only error-severity messages', () => {
        const errors = collectErrors([
            { severity: 'warning', text: 'w' },
            { severity: 'error', text: 'e' },
            { severity: 'info', text: 'i' },
        ]);
        expect(errors.length).toBe(1);
        expect(errors[0]?.text).toBe('e');
    });
});
