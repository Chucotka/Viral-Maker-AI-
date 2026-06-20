const { resolveWebAuthOrigin, resolveWebAppUrl } = require('../lib/webOrigin');

function buildTelegramLoginUrl(botId, origin) {
  const returnTo = resolveWebAppUrl();
  const params = new URLSearchParams({
    bot_id: String(botId),
    origin,
    request_access: 'write',
    return_to: returnTo,
  });
  return `https://oauth.telegram.org/auth?${params.toString()}`;
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).end();

  const token = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const botId =
    String(process.env.TELEGRAM_BOT_ID || '').trim() ||
    (token.includes(':') ? token.split(':')[0] : '');
  const botUsername = String(process.env.TELEGRAM_BOT_USERNAME || 'viral_maker_ai_bot').replace(/^@+/, '');

  if (!botId) {
    return res.status(503).json({ error: 'server_misconfigured', message: 'Нет TELEGRAM_BOT_TOKEN.' });
  }

  if (!/^\d{8,12}$/.test(botId)) {
    return res.status(503).json({
      error: 'invalid_bot_token',
      message: 'TELEGRAM_BOT_TOKEN повреждён — проверьте, что id бота скопирован полностью (до двоеточия).',
    });
  }

  const origin = resolveWebAuthOrigin();
  const loginUrl = buildTelegramLoginUrl(botId, origin);
  const telegramBotUrl = `https://t.me/${botUsername}`;

  return res.json({
    botId: String(botId),
    botUsername,
    loginUrl,
    telegramBotUrl,
    webAppUrl: resolveWebAppUrl(),
    oauthOrigin: origin,
    callbackUrl: `${origin}/api/auth/telegram-callback`,
  });
};

module.exports.buildTelegramLoginUrl = buildTelegramLoginUrl;
