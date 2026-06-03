/**
 * Владельцы приложения — Telegram user id из env OWNER_TELEGRAM_IDS.
 * Формат: "123456789" или "123,456,789"
 */

function parseOwnerTelegramIds() {
  const raw = String(process.env.OWNER_TELEGRAM_IDS || '').trim();
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
