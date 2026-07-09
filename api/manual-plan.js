const { resolveTelegramUser } = require('../lib/miniAppAuth');
const { getAdminAccessStatus, adminDenialMessage } = require('../lib/adminAccess');
const { sendSafeError } = require('../lib/httpErrors');
const { readDebugSecret, normalizeDebugPlan } = require('../lib/debugPlan');
const {
  isKvConfigured,
  setUserPlan,
  planDurationDays,
  getUserRecord,
  findUserIdByTelegramUsername,
  clearUserPlan,
  listActivePaidUsers,
  listSubscriptionOverview,
} = require('../lib/kvUserStore');
const { getFunnelSnapshot } = require('../lib/funnelMetrics');

function parseTarget(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (/^\d{4,}$/.test(raw)) {
    return { type: 'userId', value: raw };
  }
  const username = raw.replace(/^@+/, '').trim();
  if (!username) return null;
  return { type: 'username', value: username };
}

function parseAction(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  if (raw === 'list' || raw === 'reset' || raw === 'debug') return raw;
  return '';
}

function requireAdmin(req, res) {
  const auth = resolveTelegramUser(req, res);
  if (!auth) return null;
  const access = getAdminAccessStatus(req, auth.userId, {
    source: auth.source,
    authKind: auth.authKind,
  });
  if (!access.ok) {
    console.warn('Manual plan ignored: forbidden', {
      userId: auth.userId,
      source: auth.source,
      reason: access.reason,
      hasSecret: !!readDebugSecret(req),
    });
    res.status(403).json({
      error: 'forbidden',
      reason: access.reason,
      userId: auth.userId,
      message: adminDenialMessage(access.reason),
    });
    return null;
  }
  return auth;
}

module.exports = async (req, res) => {
  try {
    console.info('Manual plan request', {
      method: req.method,
      path: req.url,
      hasSecret: !!readDebugSecret(req),
      contentType: req.headers['content-type'] || '',
    });

    if (!isKvConfigured()) {
      console.warn('Manual plan ignored: kv_required');
      return res.status(503).json({
        error: 'kv_required',
        message: 'Manual activation requires Redis in production.',
      });
    }

    const pathOnly = String(req.url || '').split('?')[0];
    const action = parseAction(req.body?.action || req.query?.action);
    const isDebugRoute = action === 'debug' || pathOnly.endsWith('/debug-plan');
    if (isDebugRoute) {
      if (req.method !== 'POST') {
        return res.status(405).end();
      }
      const auth = requireAdmin(req, res);
      if (!auth) return;
      const plan = normalizeDebugPlan(req.body?.plan || req.query?.plan);
      if (!plan) {
        return res.status(400).json({ error: 'invalid_plan' });
      }
      await setUserPlan(auth.userId, plan, { durationDays: planDurationDays() });
      return res.json({
        ok: true,
        userId: auth.userId,
        plan,
        planUntil: new Date(Date.now() + planDurationDays() * 864e5).toISOString(),
      });
    }

    if (action === 'list') {
      if (req.method !== 'GET' && req.method !== 'POST') {
        return res.status(405).end();
      }
      if (!requireAdmin(req, res)) return;
      let overview;
      try {
        overview = await listSubscriptionOverview({ scanCount: 150, freeLimit: 50 });
      } catch (scanErr) {
        console.error('Manual plan list scan failed', scanErr);
        return res.status(503).json({
          error: 'list_failed',
          message: 'Не удалось прочитать базу пользователей (Redis). Попробуйте через минуту.',
        });
      }
      console.info('Manual plan list returned', overview.totals);
      const funnel = await getFunnelSnapshot(7);
      return res.json({
        ok: true,
        items: overview.active,
        count: overview.totals.active,
        overview,
        funnel,
      });
    }

    if (req.method !== 'POST') {
      return res.status(405).end();
    }

    if (!requireAdmin(req, res)) return;

    const target = parseTarget(req.body?.target || req.body?.userId || req.body?.username || req.query?.target);
    if (!target) {
      return res.status(400).json({
        error: 'missing_target',
        message: 'Укажите @username или userId.',
      });
    }

    let userId = target.type === 'userId' ? target.value : await findUserIdByTelegramUsername(target.value);
    if (!userId) {
      return res.status(404).json({
        error: 'target_not_found',
        message: 'Пользователь не найден. Попросите его хотя бы один раз открыть mini app.',
      });
    }

    if (action === 'reset' || String(req.body?.plan || req.query?.plan || '').trim().toLowerCase() === 'free') {
      await clearUserPlan(userId);
      const rec = await getUserRecord(userId);
      console.info('Manual plan reset', { userId, telegramUsername: rec.telegramUsername || null });
      return res.json({
        ok: true,
        action: 'reset',
        userId,
        plan: 'free',
        telegramUsername: rec.telegramUsername || null,
        planUntil: null,
      });
    }

    const plan = normalizeDebugPlan(req.body?.plan || req.query?.plan);
    if (!plan) {
      return res.status(400).json({ error: 'invalid_plan' });
    }

    await setUserPlan(userId, plan, { durationDays: planDurationDays() });
    const rec = await getUserRecord(userId);

    console.info('Manual plan activated', {
      userId,
      plan,
      telegramUsername: rec.telegramUsername || null,
    });

    return res.json({
      ok: true,
      userId,
      plan,
      telegramUsername: rec.telegramUsername || null,
      planUntil: rec.planUntil || null,
    });
  } catch (e) {
    sendSafeError(res, e, 'manual-plan');
  }
};
