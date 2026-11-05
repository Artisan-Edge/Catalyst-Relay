// Parse an ABAP Unit run result (testruns.result.v2) into a tree plus summary

import type { Result } from '../../../types/result';
import { ok, err } from '../../../types/result';
import { safeParseXml } from '../../utils/xml';
import { ADTCORE_NS, childElements } from '../../utils/xmlDom';
import type { UnitTestAlert, UnitTestClass, UnitTestMethod, UnitTestMethodStatus, UnitTestProgram, UnitTestRunResult, UnitTestStackEntry, UnitTestSummary } from './types';

const AUNIT_NS = 'http://www.sap.com/adt/aunit';
const FAILING_KINDS = new Set(['failedAssertion', 'exception']);
const POSITION = /#start=(\d+)(?:,(\d+))?/;

export function parseRunResult(xml: string): Result<UnitTestRunResult, Error> {
    const [doc, parseErr] = safeParseXml(xml);
    if (parseErr) return err(parseErr);

    const root = doc.documentElement;
    if (!root || root.localName !== 'runResult') return err(new Error(`Unexpected ABAP Unit response: <${root?.nodeName ?? 'empty'}>`));

    const programs = children(root, 'program').map(parseProgram);
    return ok({ programs, summary: summarize(programs) });
}

export function summarize(programs: readonly UnitTestProgram[]): UnitTestSummary {
    const classes = programs.flatMap(program => program.testClasses);
    const methods = classes.flatMap(testClass => testClass.methods);
    const alerts = [
        ...programs.flatMap(program => program.alerts),
        ...classes.flatMap(testClass => testClass.alerts),
        ...methods.flatMap(method => method.alerts),
    ];
    const failingAlerts = alerts.filter(alert => FAILING_KINDS.has(alert.kind)).length;
    const executionTime = methods.reduce((total, method) => total + method.executionTime, 0);
    const syntaxErrors = programs.filter(program => program.hasSyntaxErrors).length;

    return {
        programs: programs.length,
        testClasses: classes.length,
        methods: methods.length,
        methodsRun: methods.length,
        passed: methods.filter(method => method.status === 'passed').length,
        failed: methods.filter(method => method.status === 'failed').length,
        errors: methods.filter(method => method.status === 'error').length,
        skippedClasses: classes.filter(testClass => testClass.methods.length === 0 && testClass.alerts.some(alert => alert.kind === 'warning')).length,
        syntaxErrors,
        failingAlerts,
        objectsWithoutResults: [],
        executionTime: Math.round(executionTime * 1000) / 1000,
        success: failingAlerts === 0 && methods.length > 0 && syntaxErrors === 0,
    };
}

function parseProgram(element: Element): UnitTestProgram {
    const alerts = parseAlerts(element);
    const classesElement = children(element, 'testClasses')[0];
    return {
        name: adtAttr(element, 'name'),
        type: adtAttr(element, 'type'),
        uri: adtAttr(element, 'uri'),
        hasSyntaxErrors: alerts.some(alert => alert.hasSyntaxErrors === true),
        alerts,
        testClasses: classesElement ? children(classesElement, 'testClass').map(parseClass) : [],
    };
}

function parseClass(element: Element): UnitTestClass {
    const methodsElement = children(element, 'testMethods')[0];
    return {
        name: adtAttr(element, 'name'),
        uri: adtAttr(element, 'uri'),
        riskLevel: element.getAttribute('riskLevel') ?? '',
        durationCategory: element.getAttribute('durationCategory') ?? '',
        alerts: parseAlerts(element),
        methods: methodsElement ? children(methodsElement, 'testMethod').map(parseMethod) : [],
    };
}

function parseMethod(element: Element): UnitTestMethod {
    const alerts = parseAlerts(element);
    return {
        name: adtAttr(element, 'name'),
        uri: adtAttr(element, 'uri'),
        executionTime: Number(element.getAttribute('executionTime') ?? 0) || 0,
        status: methodStatus(alerts),
        alerts,
    };
}

// An exception outranks a failed assertion; warnings alone still pass
function methodStatus(alerts: readonly UnitTestAlert[]): UnitTestMethodStatus {
    if (alerts.some(alert => alert.kind === 'exception')) return 'error';
    if (alerts.some(alert => alert.kind === 'failedAssertion')) return 'failed';
    return 'passed';
}

// The element's own <alerts>, not those of nested classes or methods
function parseAlerts(owner: Element): UnitTestAlert[] {
    const alertsElement = children(owner, 'alerts')[0];
    if (!alertsElement) return [];
    return children(alertsElement, 'alert').map(parseAlert);
}

function parseAlert(element: Element): UnitTestAlert {
    const titleElement = children(element, 'title')[0];
    const detailsElement = children(element, 'details')[0];
    const stackElement = children(element, 'stack')[0];

    const alert: UnitTestAlert = {
        kind: element.getAttribute('kind') ?? '',
        severity: element.getAttribute('severity') ?? '',
        title: titleElement?.textContent ?? '',
        details: detailsElement ? flattenDetails(detailsElement, 0) : [],
        stack: stackElement ? children(stackElement, 'stackEntry').map(parseStackEntry) : [],
    };
    const syntax = element.getAttributeNS(AUNIT_NS, 'hasSyntaxErrors') || element.getAttribute('aunit:hasSyntaxErrors');
    if (syntax === 'true') alert.hasSyntaxErrors = true;
    return alert;
}

// <detail text> nests further <details>; nested lines are indented two spaces per level
function flattenDetails(detailsElement: Element, depth: number): string[] {
    const lines: string[] = [];
    for (const detail of children(detailsElement, 'detail')) {
        const text = detail.getAttribute('text');
        if (text) lines.push(`${'  '.repeat(depth)}${text}`);

        const nested = children(detail, 'details')[0];
        if (nested) lines.push(...flattenDetails(nested, depth + 1));
    }
    return lines;
}

function parseStackEntry(element: Element): UnitTestStackEntry {
    const uri = adtAttr(element, 'uri');
    const entry: UnitTestStackEntry = { uri, description: adtAttr(element, 'description') };

    const match = POSITION.exec(uri);
    if (match?.[1]) entry.line = Number(match[1]);
    if (match?.[2]) entry.column = Number(match[2]);
    return entry;
}

function adtAttr(element: Element, name: string): string {
    return element.getAttributeNS(ADTCORE_NS, name) || element.getAttribute(`adtcore:${name}`) || '';
}

function children(parent: Element, localName: string): Element[] {
    return childElements(parent, localName);
}
