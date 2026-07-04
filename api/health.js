const { isKvConfigured } = require('../lib/kvUserStore');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).end();

  const redis = isKvConfigured();
  const checks = {
    ok: redis && Boolean(process.env.GEMINI_API_KEY) && Boolean(process.env.TELEGRAM_BOT_TOKEN),
    redis,
    gemini: Boolean(process.env.GEMINI_API_KEY),
    gemini_proxy: Boolean(
      process.env.GEMINI_HTTPS_PROXY || process.env.GEMINI_PROXY || process.env.HTTPS_PROXY,
    ),
    bot: Boolean(process.env.TELEGRAM_BOT_TOKEN),
    tribute: Boolean(process.env.TRIBUTE_API_KEY),
    session: Boolean(process.env.SESSION_SECRET || process.env.DEBUG_ADMIN_SECRET),
    webapp_url: process.env.WEBAPP_URL || null,
    tribute_webhook_url: process.env.WEBAPP_URL
      ? `${String(process.env.WEBAPP_URL).replace(/\/$/, '')}/api/tribute-webhook`
      : null,
    ts: new Date().toISOString(),
  };

  return res.status(checks.ok ? 200 : 503).json(checks);
};
