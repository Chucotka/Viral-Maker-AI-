const TRIBUTE_SLUG_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

function normalizePlan(plan) {
  const p = String(plan || '').trim().toLowerCase();
  return p === 'pro' || p === 'premium' ? p : null;
}

function extractSlugFromWebLink(webLink) {
  const m = String(webLink || '').trim().match(/\/p\/([^/?#]+)/i);
  return m ? m[1] : null;
}

/** Tribute кодирует числовой product id в slug после /p/ (base62). */
function decodeTributeSlug(slug) {
  const s = String(slug || '').trim();
  if (!s) return null;
  const base = TRIBUTE_SLUG_ALPHABET.length;
  let id = 0;
  for (const ch of s) {
    const idx = TRIBUTE_SLUG_ALPHABET.indexOf(ch);
    if (idx < 0) return null;
    id = id * base + idx;
  }
  return id > 0 ? id : null;
}

function resolveProductId(webLink, productIdRaw) {
  const explicit = Number(productIdRaw);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const slug = extractSlugFromWebLink(webLink);
  return decodeTributeSlug(slug);
}

function getTributePlanConfig(plan) {
  const p = normalizePlan(plan);
  if (!p) return null;
  const prefix = p === 'pro' ? 'TRIBUTE_PRO' : 'TRIBUTE_PREMIUM';
  const webLink = process.env[`${prefix}_WEBLINK`] || process.env[`${prefix}_WEB_LINK`] || '';
  const productIdRaw = process.env[`${prefix}_PRODUCT_ID`] || '';
  const trimmedLink = typeof webLink === 'string' ? webLink.trim() : '';
  const productId = resolveProductId(trimmedLink, productIdRaw);
  return {
    plan: p,
    webLink: trimmedLink,
    productId: productId ?? null,
  };
}

function resolveTributePlanByProductId(productId) {
  const id = Number(productId);
  if (!Number.isFinite(id) || id <= 0) return null;
  const pro = getTributePlanConfig('pro');
  if (pro?.productId === id) return 'pro';
  const premium = getTributePlanConfig('premium');
  if (premium?.productId === id) return 'premium';
  return null;
}

module.exports = {
  getTributePlanConfig,
  resolveTributePlanByProductId,
  decodeTributeSlug,
  extractSlugFromWebLink,
};
