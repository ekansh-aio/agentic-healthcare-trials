// ─── Shared Publisher Helpers ─────────────────────────────────────────────────
export const hasType  = (ad, type) => Array.isArray(ad.ad_type) ? ad.ad_type.includes(type) : ad.ad_type === type;
export const typeLabel = (ad) => !ad ? "" : (Array.isArray(ad.ad_type) ? ad.ad_type : [ad.ad_type]).join(", ");
