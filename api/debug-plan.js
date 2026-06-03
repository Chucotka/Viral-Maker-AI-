const { resolveTelegramUser } = require('../lib/miniAppAuth');
const { isKvConfigured, setUserPlan, planDurationDays } = require('../lib/kvUserStore');
const { hasAdminApiAccess } = require('../lib/adminAccess');
const { sendSafeError } = require('../lib/httpErrors');
const { normalizeDebugPlan, readDebugSecret } = require('../lib/debugPlan');

module.exports = async (req, res) => {
  try {
    console.info('Debug plan request', {
      method: req.method,
      path: req.url,
      hasSecret: !!readDebugSecret(req),
      contentType: req.headers['content-type'] || '',
    });

    if (!isKvConfigured()) {
      console.warn('Debug plan ignored: kv_required');
      return res.status(503).json({
        error: 'kv_required',
        message: 'Debug activation requires Redis in production.',
      });
    }

    if (req.method !== 'POST') {
      console.warn('Debug plan ignored: method_not_allowed');
      return res.status(405).end();
    }

    if (!hasAdminApiAccess(req, auth.userId)) {
      console.warn('Debug plan ignored: forbidden');
      return res.status(403).json({ error: 'forbidden' });
    }

    const auth = resolveTelegramUser(req, res);
    if (!auth) {
      console.warn('Debug plan ignored: missing_or_invalid_init_data');
      return;
    }

    const plan = normalizeDebugPlan(req.body?.plan || req.query?.plan);
    if (!plan) {
      console.warn('Debug plan ignored: invalid_plan', { plan: req.body?.plan || req.query?.plan });
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
    sendSafeError(res, e, 'debug-plan');
  }
};
