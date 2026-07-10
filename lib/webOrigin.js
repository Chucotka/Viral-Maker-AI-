/** Origin для веб-входа и OAuth — всегда app.innoko.ru, не лендинг innoko.ru */
function resolveWebAuthOrigin() {
  const explicit = String(process.env.WEB_AUTH_ORIGIN || process.env.APP_ORIGIN || '').trim();
  if (explicit) {
    try {
      return new URL(explicit).origin;
    } catch {
      /* fall through */
    }
  }

  const raw = String(process.env.WEBAPP_URL || 'https://app.innoko.ru').trim();
  try {
    const host = new URL(raw).hostname;
    if (host === 'innoko.ru' || host === 'www.innoko.ru') {
      return 'https://app.innoko.ru';
    }
    return new URL(raw).origin;
  } catch {
    return 'https://app.innoko.ru';
  }
}

function resolveWebAppUrl() {
  return `${resolveWebAuthOrigin()}/app/`;
}

module.exports = {
  resolveWebAuthOrigin,
  resolveWebAppUrl,
};
