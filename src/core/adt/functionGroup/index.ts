/**
 * Function groups — every rule about groups (.asfugr), their includes (.asfinc) and modules (.asfunc)
 *
 * upsert, delete and activate call into this module; types come from OBJECT_CONFIG_MAP.
 */

export { containerFromUri, containerFromIncludeName, groupFromUri, groupFromMainProgramName, isGeneratedInclude, isFunctionGroup, isFunctionGroupInclude } from './names';
export { ensureFunctionGroup } from './ensureFunctionGroup';
export { prepareFunctionGroups } from './prepareFunctionGroups';
export { withFunctionGroupParts } from './withFunctionGroupParts';
export { FUNCTION_GROUP_UPSERT_ORDER, refuseGeneratedInclude, withIncludeHint } from './upsertRules';
export { splitGroupParts, isOwnGroupReference, owningGroupInSet } from './deleteRules';
export { rollUpGroupParts } from './rollUpGroupParts';
export { oneAtATimePerGroup } from './oneAtATimePerGroup';
