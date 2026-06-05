function normalizeUsername(value) {
  return String(value || '').trim().replace(/^@+/, '');
}

/** Ссылка на чат поддержки в Telegram (?start=support). */
function buildSupportChatLink() {
  const username = normalizeUsername(
    process.env.SUPPORT_TELEGRAM_USERNAME || process.env.TELEGRAM_BOT_USERNAME || 'viral_maker_ai_bot',
  );
  if (!username) return null;
  return `https://t.me/${username}?start=support`;
}

module.exports = { buildSupportChatLink, normalizeUsername };
