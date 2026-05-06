const { hasDebugAccess, readDebugSecret, normalizeDebugPlan } = require('../lib/debugPlan');
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

    if (req.method !== 'POST') {
      console.warn('Manual plan ignored: method_not_allowed');
      return res.status(405).end();
    }

    if (!hasDebugAccess(req)) {
      console.warn('Manual plan ignored: forbidden');
      return res.status(403).json({ error: 'forbidden' });
    }

    const action = parseAction(req.body?.action || req.query?.action);
    if (action === 'list') {
      const items = await listActivePaidUsers({ limit: 100, scanCount: 100 });
      console.info('Manual plan list returned', { count: items.length });
      return res.json({ ok: true, items, count: items.length });
    }

    const target = parseTarget(req.body?.target || req.body?.userId || req.body?.username || req.query?.target);
    if (!target) {
      console.warn('Manual plan ignored: missing_target');
      return res.status(400).json({
        error: 'missing_target',
        message: 'Укажите @username или userId.',
      });
    }

    let userId = target.type === 'userId' ? target.value : await findUserIdByTelegramUsername(target.value);
    if (!userId) {
      console.warn('Manual plan ignored: target_not_found', target);
      return res.status(404).json({
        error: 'target_not_found',
        message: 'Пользователь не найден. Попросите его хотя бы один раз открыть mini app.',
      });
    }

    if (action === 'reset' || String(req.body?.plan || req.query?.plan || '').trim().toLowerCase() === 'free') {
      await clearUserPlan(userId);
      const rec = await getUserRecord(userId);
      console.info('Manual plan reset', {
        userId,
        telegramUsername: rec.telegramUsername || null,
      });
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
      console.warn('Manual plan ignored: invalid_plan', { plan: req.body?.plan || req.query?.plan });
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
    console.error('Manual plan error:', e.message);
    return res.status(500).json({ error: e.message });
  }
};
