const { getTributePlanConfig } = require('../lib/tributeConfig');

module.exports = async (req, res) => {
  try {
    const plan = String(req.query?.plan || '').toLowerCase();
    const config = getTributePlanConfig(plan);
    if (!config) {
      return res.status(400).json({ error: 'invalid_plan' });
    }
    if (!config.webLink) {
      return res.status(503).json({
        error: 'tribute_not_configured',
        message: 'Добавьте TRIBUTE_PRO_WEBLINK / TRIBUTE_PREMIUM_WEBLINK в Vercel.',
      });
    }
    res.json({ plan: config.plan, link: config.webLink });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
