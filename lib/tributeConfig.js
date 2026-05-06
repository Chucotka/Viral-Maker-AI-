function normalizePlan(plan) {
  const p = String(plan || '').trim().toLowerCase();
  return p === 'pro' || p === 'premium' ? p : null;
}

function getTributePlanConfig(plan) {
  const p = normalizePlan(plan);
  if (!p) return null;
  const prefix = p === 'pro' ? 'TRIBUTE_PRO' : 'TRIBUTE_PREMIUM';
  const webLink = process.env[`${prefix}_WEBLINK`] || process.env[`${prefix}_WEB_LINK`] || '';
  const productIdRaw = process.env[`${prefix}_PRODUCT_ID`] || '';
  const productId = Number(productIdRaw);
  return {
    plan: p,
    webLink: typeof webLink === 'string' ? webLink.trim() : '',
    productId: Number.isFinite(productId) && productId > 0 ? productId : null,
  };
}

function getTributeWebhookSecret() {
  return String(process.env.TRIBUTE_WEBHOOK_SECRET || '').trim();
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
  getTributeWebhookSecret,
  resolveTributePlanByProductId,
};
