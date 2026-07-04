const { createGuestUser } = require('../lib/webGuest');
const { readSessionToken, verifySession, signSession, setSessionCookie } = require('../lib/webSession');
const { parseReferrerId } = require('../lib/referralService');

function sessionResponse(payload) {
  const user = payload?.user && typeof payload.user === 'object' ? payload.user : null;
  const authKind = payload?.authKind || (user?.is_guest ? 'guest' : 'telegram');
  return {
    authenticated: Boolean(payload?.sub),
    userId: payload?.sub || null,
    user,
    authKind,
    isGuest: authKind === 'guest',
    startParam: payload?.startParam || null,
  };
}

function readStartParamFromQuery(req) {
  const raw = req.query?.startapp || req.query?.start_param || '';
  const s = String(raw || '').trim().slice(0, 128);
  if (!s || !parseReferrerId(s)) return null;
  return s;
}

function createGuestSession(res, startParam = null) {
  const guest = createGuestUser();
  const token = signSession({
    userId: guest.id,
    user: guest,
    authKind: 'guest',
    startParam: startParam || null,
  });
  setSessionCookie(res, token);
  return verifySession(token);
}

function refreshSession(res, payload, startParam) {
  const token = signSession({
    userId: payload.sub,
    user: payload.user,
    authKind: payload.authKind || 'guest',
    startParam,
  });
  setSessionCookie(res, token);
  return verifySession(token);
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).end();

  const queryStartParam = readStartParamFromQuery(req);
  const token = readSessionToken(req);
  let payload = token ? verifySession(token) : null;

  if (!payload?.sub) {
    try {
      payload = createGuestSession(res, queryStartParam);
    } catch (e) {
      return res.status(500).json({
        error: 'session_misconfigured',
        message: 'На сервере не настроен SESSION_SECRET (или DEBUG_ADMIN_SECRET).',
      });
    }
  } else if (queryStartParam && !payload.startParam) {
    try {
      payload = refreshSession(res, payload, queryStartParam);
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
module.exports.readStartParamFromQuery = readStartParamFromQuery;
