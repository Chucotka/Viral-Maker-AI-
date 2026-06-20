function resolveWebOrigin() {
  const raw = String(process.env.WEBAPP_URL || 'https://app.innoko.ru').trim();
  try {
    return new URL(raw).origin;
  } catch {
    return 'https://app.innoko.ru';
  }
}

function buildTelegramLoginUrl(botId, origin) {
  const returnTo = `${origin}/app/`;
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
  const botId = token.includes(':') ? token.split(':')[0] : '';
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

  const origin = resolveWebOrigin();
  const loginUrl = buildTelegramLoginUrl(botId, origin);
  const telegramBotUrl = `https://t.me/${botUsername}`;

  return res.json({
    botId: String(botId),
    botUsername,
    loginUrl,
    telegramBotUrl,
  });
};

module.exports.buildTelegramLoginUrl = buildTelegramLoginUrl;
module.exports.resolveWebOrigin = resolveWebOrigin;
