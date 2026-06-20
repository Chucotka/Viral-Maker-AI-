const { readSessionToken, verifySession } = require('../lib/webSession');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).end();
  const token = readSessionToken(req);
  const payload = token ? verifySession(token) : null;
  const user = payload?.user && typeof payload.user === 'object' ? payload.user : null;
  res.json({
    authenticated: Boolean(payload?.sub),
    userId: payload?.sub || null,
    user,
  });
};
