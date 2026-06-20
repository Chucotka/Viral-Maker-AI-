const { validateTelegramLoginWidget } = require('../lib/telegramLoginWidget');
const { signSession, setSessionCookie } = require('../lib/webSession');

function appBasePath() {
  const url = String(process.env.WEBAPP_URL || '').trim().replace(/\/$/, '');
  if (url.endsWith('/app')) return '/app/';
  return '/app/';
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).end();

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return res.redirect(302, `${appBasePath()}?auth_error=server`);
  }

  const validated = validateTelegramLoginWidget(req.query || {}, botToken);
  if (!validated) {
    return res.redirect(302, `${appBasePath()}?auth_error=invalid`);
  }

  try {
    const userId = String(validated.user.id);
    const sessionToken = signSession({ userId, user: validated.user });
    setSessionCookie(res, sessionToken);
    return res.redirect(302, appBasePath());
  } catch (e) {
    return res.redirect(302, `${appBasePath()}?auth_error=session`);
  }
};
