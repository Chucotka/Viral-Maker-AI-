/**
 * Доступ к admin API: только владелец приложения + верный DEBUG_ADMIN_SECRET.
 */

const { hasDebugAccess, readDebugSecret } = require('./debugPlan');
const { isAppOwner } = require('./appOwner');
const { isGuestUserId } = require('./webGuest');

const ADMIN_DENIAL_MESSAGES = {
  guest_session:
    'Вы в браузере как гость. Нажмите «Войти» в шапке → «Войти через Telegram в браузере» (не «Открыть в Telegram»).',
  not_owner:
    'Ваш Telegram ID не указан в OWNER_TELEGRAM_ID на сервере. Проверьте userId в настройках и .env на VPS.',
  secret_not_configured:
    'На сервере не задан DEBUG_ADMIN_SECRET. Добавьте его в .env на VPS и перезапустите приложение.',
  secret_missing: 'Введите DEBUG_ADMIN_SECRET в поле выше (значение из .env на VPS).',
  secret_mismatch:
    'Неверный DEBUG_ADMIN_SECRET. Скопируйте значение из .env на VPS без пробелов и лишних символов.',
};

function isTrustedTelegramAuth(authMeta = {}) {
  const source = String(authMeta.source || '');
  const authKind = String(authMeta.authKind || '');
  if (source === 'telegram_mini_app') return true;
  if (source === 'web_session' && authKind === 'telegram') return true;
  return false;
}

function getAdminAccessStatus(req, userId, authMeta = {}) {
  const id = userId == null ? '' : String(userId);
  if (!id) {
    return { ok: false, reason: 'guest_session', userId: id };
  }
  if (isGuestUserId(id)) {
    return { ok: false, reason: 'guest_session', userId: id };
  }
  if (!isAppOwner(id)) {
    return { ok: false, reason: 'not_owner', userId: id };
  }
  // Mini App и браузер после OAuth: Telegram уже подтвердил личность.
  if (isTrustedTelegramAuth(authMeta)) {
    return { ok: true, userId: id, via: authMeta.source || 'telegram' };
  }
  const required = String(process.env.DEBUG_ADMIN_SECRET || '').trim();
  if (!required) {
    return { ok: false, reason: 'secret_not_configured', userId: id };
  }
  if (!hasDebugAccess(req)) {
    const provided = readDebugSecret(req);
    return {
      ok: false,
      reason: provided ? 'secret_mismatch' : 'secret_missing',
      userId: id,
    };
  }
  return { ok: true, userId: id, via: 'debug_secret' };
}

function hasAdminApiAccess(req, userId, authMeta = {}) {
  return getAdminAccessStatus(req, userId, authMeta).ok;
}

function adminDenialMessage(reason) {
  return ADMIN_DENIAL_MESSAGES[reason] || ADMIN_DENIAL_MESSAGES.secret_mismatch;
}

module.exports = {
  hasAdminApiAccess,
  getAdminAccessStatus,
  adminDenialMessage,
  ADMIN_DENIAL_MESSAGES,
};
