const { resolveTelegramUser } = require('../lib/miniAppAuth');
const { hasAdminApiAccess } = require('../lib/adminAccess');
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
} = require('../lib/kvUserStore');

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
  if (raw === 'list' || raw === 'reset') return raw;
  return '';
}

function requireAdmin(req, res) {
  const auth = resolveTelegramUser(req, res);
  if (!auth) return null;
  if (!hasAdminApiAccess(req, auth.userId)) {
    console.warn('Manual plan ignored: forbidden', { userId: auth.userId });
    res.status(403).json({ error: 'forbidden' });
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

    const action = parseAction(req.body?.action || req.query?.action);
    if (action === 'list') {
      if (req.method !== 'GET' && req.method !== 'POST') {
        return res.status(405).end();
      }
      if (!requireAdmin(req, res)) return;
      const items = await listActivePaidUsers({ limit: 100, scanCount: 100 });
      console.info('Manual plan list returned', { count: items.length });
      return res.json({ ok: true, items, count: items.length });
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
