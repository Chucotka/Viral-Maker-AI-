const { resolveTelegramUser } = require('../lib/miniAppAuth');
const { isKvConfigured, setUserPlan, planDurationDays } = require('../lib/kvUserStore');
const { hasDebugAccess, normalizeDebugPlan } = require('../lib/debugPlan');

module.exports = async (req, res) => {
  try {
    if (!isKvConfigured()) {
      return res.status(503).json({
        error: 'kv_required',
        message: 'Debug activation requires Redis in production.',
      });
    }

    if (req.method !== 'POST') {
      return res.status(405).end();
    }

    if (!hasDebugAccess(req)) {
      return res.status(403).json({ error: 'forbidden' });
    }

    const auth = resolveTelegramUser(req, res);
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
  } catch (e) {
    console.error('Debug plan error:', e.message);
    res.status(500).json({ error: e.message });
  }
};
