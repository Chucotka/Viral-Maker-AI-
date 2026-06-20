const { validateTelegramLoginWidget } = require('../lib/telegramLoginWidget');
const { signSession, setSessionCookie } = require('../lib/webSession');
const { resolveWebAppUrl } = require('../lib/webOrigin');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).end();

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const appUrl = resolveWebAppUrl();

  if (!botToken) {
    return res.redirect(302, `${appUrl}?auth_error=server`);
  }

  const validated = validateTelegramLoginWidget(req.query || {}, botToken);
  if (!validated) {
    return res.redirect(302, `${appUrl}?auth_error=invalid`);
  }

  try {
    const userId = String(validated.user.id);
    const sessionToken = signSession({ userId, user: validated.user, authKind: 'telegram' });
    setSessionCookie(res, sessionToken);
    return res.redirect(302, appUrl);
  } catch (e) {
    return res.redirect(302, `${appUrl}?auth_error=session`);
  }
};
