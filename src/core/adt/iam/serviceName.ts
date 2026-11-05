/**
 * IAM Service Name — split SAP's version-padded relServiceName and match listed services
 *
 * SAP stores an IWSV relServiceName as "<SERVICE><spaces><VERSION>" (e.g. "APJ_JOB_MANAGEMENT_SRV             0001");
 * G4BA and INA1 names carry no version.
 */

import type { IamAppService, IamServiceRef } from './types';

const DEFAULT_IWSV_VERSION = '0001';
const VERSION_PATTERN = /^\d{4}$/;

/** Name and version of a relServiceName (version '' when none) */
export function splitServiceName(relServiceName: string): { name: string; version: string } {
    const [name = '', version = ''] = relServiceName.trim().toUpperCase().split(/\s+/);
    return VERSION_PATTERN.test(version) ? { name, version } : { name: relServiceName.trim().toUpperCase(), version: '' };
}

/** Whether a requested service is already listed (same type and name; same version for IWSV, default 0001) */
export function isServiceListed(listed: readonly IamAppService[], ref: IamServiceRef): boolean {
    const name = ref.name.trim().toUpperCase();
    const version = ref.type === 'IWSV' ? (ref.version ?? DEFAULT_IWSV_VERSION) : '';
    return listed.some(service => service.type === ref.type && service.name === name && (!version || !service.version || service.version === version));
}
