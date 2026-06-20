/**
 * Доступ к admin API: только владелец приложения + верный DEBUG_ADMIN_SECRET.
 */

const { hasDebugAccess, readDebugSecret } = require('./debugPlan');
const { isAppOwner } = require('./appOwner');

function hasAdminApiAccess(req, userId) {
  if (!isAppOwner(userId)) return false;
  return hasDebugAccess(req);
}

/** @returns {'ok' | 'not_owner' | 'invalid_secret' | 'secret_required'} */
function checkAdminApiAccess(req, userId) {
  if (!isAppOwner(userId)) return 'not_owner';
  if (!String(readDebugSecret(req) || '').trim()) return 'secret_required';
  if (!hasDebugAccess(req)) return 'invalid_secret';
  return 'ok';
}

module.exports = { hasAdminApiAccess, checkAdminApiAccess };
