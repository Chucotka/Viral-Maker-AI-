/** Определение контекста Telegram (Mini App vs in-app browser vs обычный браузер). */
function isInsideTelegramClient(userAgent) {
  return /Telegram/i.test(String(userAgent || ''));
}

function isTelegramMiniAppFromFlags(flags = {}) {
  return Boolean(flags.hasInitData);
}

function shouldBlockInAppTelegramNavigation(userAgent, hasInitData) {
  return isInsideTelegramClient(userAgent) || Boolean(hasInitData);
}

module.exports = {
  isInsideTelegramClient,
  isTelegramMiniAppFromFlags,
  shouldBlockInAppTelegramNavigation,
};
