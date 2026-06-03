/**
 * Доступ к admin API: только владелец приложения + верный DEBUG_ADMIN_SECRET.
 */

const { hasDebugAccess } = require('./debugPlan');
const { isAppOwner } = require('./appOwner');

function hasAdminApiAccess(req, userId) {
  if (!isAppOwner(userId)) return false;
  return hasDebugAccess(req);
}

module.exports = { hasAdminApiAccess };
