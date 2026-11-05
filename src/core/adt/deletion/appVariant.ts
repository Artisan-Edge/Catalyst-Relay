/**
 * App Variant — the ADT URI of a Fiori app variant (ADVC/LRP)
 *
 * App variants have only a vit URI, which rejects LOCK (405); they are deleted through the
 * deletion service.
 */

const APP_VARIANT_URI_PREFIX = '/sap/bc/adt/vit/wb/object_type/advclrp/object_name/';

/** vit URI of an app variant, e.g. /sap/bc/adt/vit/wb/object_type/advclrp/object_name/ZCGCB... */
export function appVariantUri(name: string): string {
    return `${APP_VARIANT_URI_PREFIX}${encodeURIComponent(name.toUpperCase())}`;
}
