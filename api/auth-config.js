const { resolveWebAuthOrigin, resolveWebAppUrl } = require('../lib/webOrigin');

const DEFAULT_OAUTH_BASE = 'https://oauth.telegram.org';

function resolveOAuthProxyBase(origin) {
  const path = String(process.env.TELEGRAM_OAUTH_PROXY_PATH || '/tg-oauth').trim() || '/tg-oauth';
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${origin}${normalized}`;
}

function buildTelegramLoginUrl(botId, origin, options = {}) {
  const oauthBase = options.oauthBase || DEFAULT_OAUTH_BASE;
  const returnTo = options.returnTo || resolveWebAppUrl();
  const params = new URLSearchParams({
    bot_id: String(botId),
    origin,
    request_access: 'write',
    return_to: returnTo,
  });
  return `${oauthBase}/auth?${params.toString()}`;
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
  const callbackUrl = `${origin}/api/auth/telegram-callback`;
  const webAppUrl = resolveWebAppUrl();
  const oauthProxyBase = resolveOAuthProxyBase(origin);
  const loginUrl = buildTelegramLoginUrl(botId, origin);
  const proxiedLoginUrl = buildTelegramLoginUrl(botId, origin, {
    oauthBase: oauthProxyBase,
    returnTo: callbackUrl,
  });
  const telegramBotUrl = `https://t.me/${botUsername}`;

  return res.json({
    botId: String(botId),
    botUsername,
    loginUrl,
    proxiedLoginUrl,
    telegramBotUrl,
    webAppUrl,
    oauthOrigin: origin,
    oauthProxyBase,
    callbackUrl,
  });
};

module.exports.buildTelegramLoginUrl = buildTelegramLoginUrl;
module.exports.resolveOAuthProxyBase = resolveOAuthProxyBase;
