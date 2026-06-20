const { clearSessionCookie } = require('../lib/webSession');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  clearSessionCookie(res);
  res.json({ ok: true });
};
