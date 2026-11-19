// ATC (ABAP Test Cockpit) runs — shared types

import type { ObjectRef } from '../../../types/requests';

export interface AtcRunOptions {
    /** Objects to check (classes, CDS views, programs, ...) */
    objects?: ObjectRef[];
    /** Packages whose objects are checked (subpackages included) */
    packages?: string[];
    /** Transport requests or tasks whose objects are checked */
    transports?: string[];
    /** Check variant; defaults to the system's (ABAP_CLOUD_DEVELOPMENT_DEFAULT on public cloud) */
    checkVariant?: string;
    /** Also return findings that have an exemption */
    includeExempted?: boolean;
    /** Overall limit for the run in ms, polling included (default 30 minutes) */
    timeout?: number;
    /** Time between status polls in ms (default 3 s) */
    pollInterval?: number;
    /** Called whenever the run's status or phase changes */
    onProgress?: (progress: AtcRunProgress) => void;
}

export interface AtcRunProgress {
    /** SAP's run status: 'Not Yet Started', 'Running', 'Completed', ... */
    status: string;
    description: string;
    /** Title of the phase in process, when one is */
    phase?: string;
}

export interface AtcFindingLocation {
    uri: string;
    line?: number;
    column?: number;
}

export interface AtcFinding {
    uri: string;
    location: AtcFindingLocation;
    /** 1 = error, 2 = warning, 3 = info */
    priority: number;
    checkId: string;
    checkTitle: string;
    messageId: string;
    messageTitle: string;
    /** SAP's verdict for transport release: 'allowTransports', 'blockPriority', ... */
    effectOnTransports: string;
    /** The finding stops the release of a transport that contains the object */
    blocksTransport: boolean;
    /** Empty unless the finding is exempted */
    exemptionKind: string;
    /** '-' unless an exemption was requested or approved */
    exemptionApproval: string;
    processor: string;
    /** Extra details SAP attaches, e.g. ADD_INFO ("Data Source: CALL (Procedure)") */
    tags?: Record<string, string>;
}

export interface AtcObject {
    type: string;
    name: string;
    packageName: string;
    author: string;
    findings: AtcFinding[];
}

export interface AtcSummary {
    /** Objects the run checked, with or without findings */
    objects: number;
    findings: number;
    errors: number;
    warnings: number;
    infos: number;
    /** Findings that stop a transport release */
    blocking: number;
    /** No finding blocks a transport release */
    releasable: boolean;
}

export interface AtcRunResult {
    checkVariant: string;
    worklistId: string;
    objects: AtcObject[];
    summary: AtcSummary;
}
