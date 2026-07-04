/** Ссылки для открытия Mini App в Telegram (t.me). */
function normalizeBotUsername(username) {
  return String(username || process.env.TELEGRAM_BOT_USERNAME || 'viral_maker_ai_bot').replace(/^@+/, '');
}

function miniAppShortName() {
  return String(process.env.TELEGRAM_MINI_APP_SHORT_NAME || '').trim();
}

/**
 * Прямая ссылка «открыть в Telegram».
 * @param {string|null|undefined} startParam — startapp (рефералка и т.д.)
 * @param {object} [opts]
 * @param {string} [opts.botUsername]
 * @param {string} [opts.shortName]
 */
function buildTelegramMiniAppOpenUrl(startParam, opts = {}) {
  const bot = normalizeBotUsername(opts.botUsername);
  const shortName = String(opts.shortName || miniAppShortName() || '').trim();

  if (shortName) {
    const base = `https://t.me/${bot}/${shortName}`;
    if (startParam && String(startParam).trim()) {
      return `${base}?startapp=${encodeURIComponent(String(startParam).trim())}`;
    }
    return base;
  }

  const param = startParam && String(startParam).trim() ? String(startParam).trim() : 'open';
  return `https://t.me/${bot}?startapp=${encodeURIComponent(param)}`;
}

module.exports = {
  normalizeBotUsername,
  miniAppShortName,
  buildTelegramMiniAppOpenUrl,
};
