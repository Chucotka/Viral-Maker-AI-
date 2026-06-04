/**
 * Владельцы приложения — Telegram user id из env.
 * OWNER_TELEGRAM_IDS: "123456789" или "123,456,789"
 * OWNER_TELEGRAM_ID: alias для одного id (если OWNER_TELEGRAM_IDS не задан)
 */

function parseOwnerTelegramIds() {
  const fromList = String(process.env.OWNER_TELEGRAM_IDS || '').trim();
  const fromSingle = String(process.env.OWNER_TELEGRAM_ID || '').trim();
  const raw = fromList || fromSingle;
  if (!raw) return [];
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter((id) => /^\d+$/.test(id));
}

function isAppOwner(userId) {
  if (userId == null || userId === '') return false;
  const owners = parseOwnerTelegramIds();
  if (!owners.length) return false;
  return owners.includes(String(userId));
}

module.exports = {
  parseOwnerTelegramIds,
  isAppOwner,
};
