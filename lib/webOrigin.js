/** Origin и URL приложения — app.innoko.ru/app или viral-maker.ru/app */
function resolveWebAuthOrigin() {
  const explicit = String(process.env.WEB_AUTH_ORIGIN || process.env.APP_ORIGIN || '').trim();
  if (explicit) {
    try {
      return new URL(explicit).origin;
    } catch {
      /* fall through */
    }
  }

  const raw = String(process.env.WEBAPP_URL || 'https://app.innoko.ru/app').trim();
  try {
    const parsed = new URL(raw);
    const host = parsed.hostname;
    if (host === 'innoko.ru' || host === 'www.innoko.ru') {
      return 'https://app.innoko.ru';
    }
    if (host === 'viral-maker.ru' || host === 'www.viral-maker.ru') {
      return 'https://viral-maker.ru';
    }
    if (host === 'app.viral-maker.ru') {
      return 'https://app.viral-maker.ru';
    }
    return parsed.origin;
  } catch {
    return 'https://app.innoko.ru';
  }
}

function resolveWebAppUrl() {
  const raw = String(process.env.WEBAPP_URL || 'https://app.innoko.ru/app').trim();
  try {
    const parsed = new URL(raw);
    const origin = resolveWebAuthOrigin();
    let path = parsed.pathname.replace(/\/?$/, '/');
    if (!path || path === '/') path = '/app/';
    return `${origin}${path.startsWith('/') ? path : `/${path}`}`;
  } catch {
    return `${resolveWebAuthOrigin()}/app/`;
  }
}

module.exports = {
  resolveWebAuthOrigin,
  resolveWebAppUrl,
};
