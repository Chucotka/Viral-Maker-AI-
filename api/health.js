const { buildHealthStatus } = require('../lib/healthStatus');
const { probeGeminiText } = require('../lib/geminiProbe');

function isDebugProbe(req) {
  const secret = String(process.env.DEBUG_ADMIN_SECRET || '').trim();
  if (!secret) return false;
  const h = req.headers || {};
  const provided = String(h['x-debug-secret'] || h['X-Debug-Secret'] || '').trim();
  return provided === secret;
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).end();
  const checks = buildHealthStatus();
  if (isDebugProbe(req)) {
    checks.gemini_probe = await probeGeminiText();
    if (!checks.gemini_probe.ok) {
      checks.ok = false;
    }
  }
  return res.status(checks.ok ? 200 : 503).json(checks);
};
