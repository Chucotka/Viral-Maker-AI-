/** Определение контекста Telegram (Mini App vs in-app browser vs обычный браузер). */

function isInsideTelegramClient(userAgent) {
  return /Telegram/i.test(String(userAgent || ''));
}

function hasTelegramInitData(initData) {
  return Boolean(String(initData || '').trim());
}

function hasTgWebAppUrlHint(search = '', hash = '') {
  return /tgWebApp/i.test(String(search || '') + String(hash || ''));
}

/**
 * Mini App с подписанной сессией Telegram (автовход).
 * Не путать с встроенным браузером Telegram без initData.
 */
function isTelegramMiniAppContext(ctx = {}) {
  if (hasTelegramInitData(ctx.initData)) return true;
  if (ctx.telegramWebApp === true) return true;
  return false;
}

function shouldInstallWebStub(ctx = {}) {
  if (isTelegramMiniAppContext(ctx)) return false;
  if (isInsideTelegramClient(ctx.userAgent)) return false;
  if (hasTgWebAppUrlHint(ctx.search, ctx.hash)) return false;
  if (ctx.telegramWebApp === true) return false;
  return true;
}

function shouldBlockInAppTelegramNavigation(userAgent, hasInitData) {
  return isInsideTelegramClient(userAgent) || hasTelegramInitData(hasInitData);
}

module.exports = {
  isInsideTelegramClient,
  hasTelegramInitData,
  hasTgWebAppUrlHint,
  isTelegramMiniAppContext,
  shouldInstallWebStub,
  shouldBlockInAppTelegramNavigation,
};
