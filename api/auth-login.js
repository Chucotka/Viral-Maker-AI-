const { validateTelegramLoginWidget } = require('../lib/telegramLoginWidget');
const { signSession, setSessionCookie } = require('../lib/webSession');
const { sendSafeError } = require('../lib/httpErrors');
const { mergeGuestIntoTelegram, readGuestUserIdFromRequest } = require('../lib/guestAccountMerge');

function parseStartParam(body) {
  const raw = body?.startParam || body?.startapp || '';
  const s = String(raw || '').trim();
  return s.length ? s.slice(0, 128) : null;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      return res.status(500).json({ error: 'server_misconfigured', message: 'Нет TELEGRAM_BOT_TOKEN.' });
    }

    const widgetData = req.body?.telegramUser || req.body;
    const validated = validateTelegramLoginWidget(widgetData, botToken);
    if (!validated) {
      return res.status(401).json({
        error: 'invalid_login',
        message: 'Не удалось подтвердить вход через Telegram. Попробуйте снова.',
      });
    }

    const userId = String(validated.user.id);
    const startParam = parseStartParam(req.body);
    const guestUserId = readGuestUserIdFromRequest(req);

    let mergeResult = { merged: false };
    if (guestUserId) {
      mergeResult = await mergeGuestIntoTelegram(guestUserId, userId, validated.user);
    }

    let sessionToken;
    try {
      sessionToken = signSession({ userId, user: validated.user, startParam, authKind: 'telegram' });
    } catch (e) {
      return res.status(500).json({
        error: 'session_misconfigured',
        message: 'На сервере не настроен SESSION_SECRET (или DEBUG_ADMIN_SECRET).',
      });
    }

    setSessionCookie(res, sessionToken);
    return res.json({
      ok: true,
      userId,
      user: validated.user,
      mergedGuest: mergeResult.merged === true,
    });
  } catch (e) {
    sendSafeError(res, e, 'auth-login');
  }
};
