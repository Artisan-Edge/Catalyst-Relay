// ABAP Unit test runs — shared types

import type { ObjectRef } from '../../../types/requests';

export type UnitTestRiskLevel = 'harmless' | 'dangerous' | 'critical';
export type UnitTestDuration = 'short' | 'medium' | 'long';

export const UNIT_TEST_RISK_LEVELS: readonly UnitTestRiskLevel[] = ['harmless', 'dangerous', 'critical'];
export const UNIT_TEST_DURATIONS: readonly UnitTestDuration[] = ['short', 'medium', 'long'];

// ADT's own defaults (Eclipse "Run As > ABAP Unit Test")
export const DEFAULT_UNIT_TEST_RISK_LEVELS: readonly UnitTestRiskLevel[] = ['harmless', 'dangerous'];
export const DEFAULT_UNIT_TEST_DURATIONS: readonly UnitTestDuration[] = ['short', 'medium'];

export interface UnitTestRunOptions {
    /** Objects whose own tests run (classes, programs, includes, function modules, ...) */
    objects?: ObjectRef[];
    /** Packages whose objects' tests run (subpackages included) */
    packages?: string[];
    /** Risk levels to execute; classes above them report a "not executed" warning */
    riskLevels?: readonly UnitTestRiskLevel[];
    durations?: readonly UnitTestDuration[];
    /** Request timeout in ms (the run is synchronous; packages can take minutes) */
    timeout?: number;
}

export type UnitTestAlertKind = 'failedAssertion' | 'exception' | 'warning' | string;

export interface UnitTestStackEntry {
    uri: string;
    description: string;
    line?: number;
    column?: number;
}

export interface UnitTestAlert {
    kind: UnitTestAlertKind;
    severity: string;
    title: string;
    details: string[];
    stack: UnitTestStackEntry[];
    /** Program-level warning: the program does not compile, so its tests were not analyzed */
    hasSyntaxErrors?: boolean;
}

export type UnitTestMethodStatus = 'passed' | 'failed' | 'error';

export interface UnitTestMethod {
    name: string;
    uri: string;
    /** Seconds */
    executionTime: number;
    status: UnitTestMethodStatus;
    alerts: UnitTestAlert[];
}

export interface UnitTestClass {
    name: string;
    uri: string;
    riskLevel: string;
    durationCategory: string;
    alerts: UnitTestAlert[];
    methods: UnitTestMethod[];
}

export interface UnitTestProgram {
    name: string;
    type: string;
    uri: string;
    hasSyntaxErrors: boolean;
    alerts: UnitTestAlert[];
    testClasses: UnitTestClass[];
}

export interface UnitTestSummary {
    programs: number;
    testClasses: number;
    /** Test methods run (same as methodsRun; kept for compatibility) */
    methods: number;
    /** Test methods run; 0 means nothing was tested */
    methodsRun: number;
    passed: number;
    /** Methods with a failed assertion */
    failed: number;
    /** Methods ending in an exception */
    errors: number;
    /** Test classes not executed (risk level / duration above the run's limits) */
    skippedClasses: number;
    /** Programs that do not compile */
    syntaxErrors: number;
    /** Failed-assertion and exception alerts at any level (class_setup failures included) */
    failingAlerts: number;
    /**
     * Requested objects (NAME.extension) with no result at all: they do not exist or have no
     * test classes; SAP answers both with an empty result. Packages are not checked.
     */
    objectsWithoutResults: string[];
    /** Sum of method execution times, seconds */
    executionTime: number;
    /** No failed assertion or exception, at least one method ran, and no program has syntax errors */
    success: boolean;
}

export interface UnitTestRunResult {
    programs: UnitTestProgram[];
    summary: UnitTestSummary;
}
