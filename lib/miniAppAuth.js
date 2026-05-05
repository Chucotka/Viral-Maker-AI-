const { validateInitData } = require('./telegramInitData');

function readInitDataString(req) {
  const h = req.headers || {};
  const fromHeader = h['x-telegram-init-data'] || h['X-Telegram-Init-Data'];
  if (fromHeader) return String(fromHeader);
  const b = req.body;
  if (b && typeof b.initData === 'string' && b.initData.length > 0) return b.initData;
  return null;
}

/**
 * Аутентификация Mini App: только userId из подписанного initData.
 * @returns {{ userId: string, user: object } | null}
 */
function resolveTelegramUser(req, res) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const initData = readInitDataString(req);
  if (!initData) {
    res.status(401).json({
      error: 'missing_init_data',
      message: 'Откройте приложение из Telegram (нет initData).',
    });
    return null;
  }
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
  return { userId: String(parsed.user.id), user: parsed.user };
}

module.exports = { readInitDataString, resolveTelegramUser };
