const { createGuestUser } = require('../lib/webGuest');
const { readSessionToken, verifySession, signSession, setSessionCookie } = require('../lib/webSession');

function sessionResponse(payload) {
  const user = payload?.user && typeof payload.user === 'object' ? payload.user : null;
  const authKind = payload?.authKind || (user?.is_guest ? 'guest' : 'telegram');
  return {
    authenticated: Boolean(payload?.sub),
    userId: payload?.sub || null,
    user,
    authKind,
    isGuest: authKind === 'guest',
  };
}

function createGuestSession(res) {
  const guest = createGuestUser();
  const token = signSession({
    userId: guest.id,
    user: guest,
    authKind: 'guest',
  });
  setSessionCookie(res, token);
  return verifySession(token);
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).end();

  const token = readSessionToken(req);
  let payload = token ? verifySession(token) : null;

  if (!payload?.sub) {
    try {
      payload = createGuestSession(res);
    } catch (e) {
      return res.status(500).json({
        error: 'session_misconfigured',
        message: 'На сервере не настроен SESSION_SECRET (или DEBUG_ADMIN_SECRET).',
      });
    }
  }

  return res.json(sessionResponse(payload));
};

module.exports.sessionResponse = sessionResponse;
module.exports.createGuestSession = createGuestSession;
