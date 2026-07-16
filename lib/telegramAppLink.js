/** Ссылки для открытия Mini App в Telegram (t.me). */
function normalizeBotUsername(username) {
  return String(username || process.env.TELEGRAM_BOT_USERNAME || 'viral_maker_ai_bot').replace(/^@+/, '');
}

function miniAppShortName() {
  return String(process.env.TELEGRAM_MINI_APP_SHORT_NAME || 'app').trim();
}

/**
 * Прямая ссылка «открыть в Telegram».
 * Формат: https://t.me/{bot}/{shortName}?startapp=...
 */
function buildTelegramMiniAppOpenUrl(startParam, opts = {}) {
  const bot = normalizeBotUsername(opts.botUsername);
  const shortName = String(opts.shortName || miniAppShortName() || 'app').trim();
  const base = `https://t.me/${bot}/${shortName}`;

  if (startParam && String(startParam).trim()) {
    return `${base}?startapp=${encodeURIComponent(String(startParam).trim())}`;
  }
  return base;
}

module.exports = {
  normalizeBotUsername,
  miniAppShortName,
  buildTelegramMiniAppOpenUrl,
};
