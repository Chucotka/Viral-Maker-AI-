const { buildHealthStatus } = require('../lib/healthStatus');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).end();
  const checks = buildHealthStatus();
  return res.status(checks.ok ? 200 : 503).json(checks);
};
