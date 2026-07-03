const { validateInitData } = require('./telegramInitData');
const { readSessionToken, verifySession } = require('./webSession');

function readInitDataString(req) {
  const h = req.headers || {};
  const fromHeader = h['x-telegram-init-data'] || h['X-Telegram-Init-Data'];
  if (fromHeader) return String(fromHeader);
  const b = req.body;
  if (b && typeof b.initData === 'string' && b.initData.length > 0) return b.initData;
  return null;
}

function authFromInitData(req, res) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const initData = readInitDataString(req);
  if (!initData) return null;
  if (!botToken) {
    res.status(500).json({ error: 'server_misconfigured', message: 'Нет TELEGRAM_BOT_TOKEN.' });
    return null;
  }
  const parsed = validateInitData(initData, botToken);
  if (!parsed) {
    res.status(401).json({
      error: 'invalid_init_data',
      message: 'Сессия недействительна. Закройте и откройте приложение снова.',
    });
    return null;
  }
  return {
    userId: String(parsed.user.id),
    user: parsed.user,
    startParam: parsed.startParam || null,
    source: 'telegram_mini_app',
  };
}

function authFromWebSession(req) {
  const token = readSessionToken(req);
  if (!token) return null;
  const payload = verifySession(token);
  if (!payload?.sub) return null;
  const user = payload.user && typeof payload.user === 'object' ? payload.user : { id: Number(payload.sub) };
  return {
    userId: String(payload.sub),
    user,
    startParam: payload.startParam || null,
    source: payload.authKind === 'guest' ? 'web_guest' : 'web_session',
    authKind: payload.authKind || (user.is_guest ? 'guest' : 'telegram'),
  };
}

/**
 * Telegram Mini App (initData) или веб-сессия (cookie после Login Widget).
 * @returns {{ userId: string, user: object, startParam?: string|null, source: string } | null}
 */
function resolveAppUser(req, res) {
  const fromTg = authFromInitData(req, res);
  if (fromTg) return fromTg;
  if (res.headersSent) return null;

  const fromWeb = authFromWebSession(req);
  if (fromWeb) return fromWeb;

  res.status(401).json({
    error: 'auth_required',
    message: 'Войдите через Telegram, чтобы использовать приложение.',
  });
  return null;
}

/** @deprecated используйте resolveAppUser */
function resolveTelegramUser(req, res) {
  return resolveAppUser(req, res);
}

module.exports = { readInitDataString, resolveAppUser, resolveTelegramUser };
