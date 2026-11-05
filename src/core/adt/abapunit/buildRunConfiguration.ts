// Request body of POST /sap/bc/adt/abapunit/testruns (testruns.config.v4)

import { escapeXml } from '../../utils/xml';
import type { UnitTestDuration, UnitTestRiskLevel } from './types';
import { UNIT_TEST_DURATIONS, UNIT_TEST_RISK_LEVELS } from './types';

export function buildRunConfiguration(uris: readonly string[], riskLevels: readonly UnitTestRiskLevel[], durations: readonly UnitTestDuration[]): string {
    const risks = UNIT_TEST_RISK_LEVELS.map(level => `${level}="${riskLevels.includes(level)}"`).join(' ');
    const lengths = UNIT_TEST_DURATIONS.map(duration => `${duration}="${durations.includes(duration)}"`).join(' ');
    const references = uris
        .map(uri => `        <adtcore:objectReference adtcore:uri="${escapeXml(uri)}"/>`)
        .join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<aunit:runConfiguration xmlns:aunit="http://www.sap.com/adt/aunit">
  <external><coverage active="false"/></external>
  <options>
    <uriType value="semantic"/>
    <testDeterminationStrategy sameProgram="true" assignedTests="false"/>
    <testRiskLevels ${risks}/>
    <testDurations ${lengths}/>
    <withNavigationUri enabled="true"/>
  </options>
  <adtcore:objectSets xmlns:adtcore="http://www.sap.com/adt/core">
    <objectSet kind="inclusive">
      <adtcore:objectReferences>
${references}
      </adtcore:objectReferences>
    </objectSet>
  </adtcore:objectSets>
</aunit:runConfiguration>`;
}
