const { isAllowedStage, trackFunnelStage } = require('../lib/funnelMetrics');
const { sendSafeError } = require('../lib/httpErrors');

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return res.status(405).end();

    const stage = String(req.body?.stage || '').trim();
    if (!isAllowedStage(stage)) {
      return res.status(400).json({ error: 'invalid_stage', message: 'Неизвестный этап воронки.' });
    }

    const props =
      req.body?.props && typeof req.body.props === 'object' && !Array.isArray(req.body.props)
        ? req.body.props
        : {};

    await trackFunnelStage(stage, props);
    return res.json({ ok: true });
  } catch (e) {
    sendSafeError(res, e, 'events');
  }
};
