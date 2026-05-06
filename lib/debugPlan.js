function normalizeDebugPlan(plan) {
  const p = String(plan || '').trim().toLowerCase();
  return p === 'pro' || p === 'premium' ? p : null;
}

function readDebugSecret(req) {
  const h = req.headers || {};
  const headerSecret = h['x-debug-secret'] || h['X-Debug-Secret'];
  const bodySecret = req.body?.secret || req.body?.debugSecret;
  const querySecret = req.query?.secret || req.query?.debugSecret;
  return String(headerSecret || bodySecret || querySecret || '').trim();
}

function hasDebugAccess(req) {
  const required = String(process.env.DEBUG_ADMIN_SECRET || '').trim();
  if (!required) return false;
  const provided = readDebugSecret(req);
  if (!provided) return false;
  return provided === required;
}

function debugDurationDays() {
  const d = Number(process.env.PLAN_DURATION_DAYS);
  return Number.isFinite(d) && d > 0 ? d : 30;
}

module.exports = {
  normalizeDebugPlan,
  readDebugSecret,
  hasDebugAccess,
  debugDurationDays,
};
