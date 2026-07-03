/** Origin и URL приложения — innoko.ru с hash-роутингом (#/dashboard) */
function resolveWebAuthOrigin() {
  const explicit = String(process.env.WEB_AUTH_ORIGIN || process.env.APP_ORIGIN || '').trim();
  if (explicit) {
    try {
      return new URL(explicit).origin;
    } catch {
      /* fall through */
    }
  }

  const raw = String(process.env.WEBAPP_URL || 'https://innoko.ru').trim();
  try {
    const host = new URL(raw).hostname;
    if (host === 'innoko.ru' || host === 'www.innoko.ru' || host === 'app.innoko.ru') {
      return 'https://innoko.ru';
    }
    return new URL(raw).origin;
  } catch {
    return 'https://innoko.ru';
  }
}

function resolveWebAppUrl() {
  return `${resolveWebAuthOrigin()}/#/dashboard`;
}

/** Базовый path для статики (legacy /app/) */
function resolveWebAppPath() {
  const raw = String(process.env.WEBAPP_URL || '').trim();
  try {
    const path = new URL(raw).pathname.replace(/\/$/, '');
    if (path && path !== '/') return `${path}/`;
  } catch {
    /* ignore */
  }
  return '/';
}

module.exports = {
  resolveWebAuthOrigin,
  resolveWebAppUrl,
  resolveWebAppPath,
};
