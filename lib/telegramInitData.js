const crypto = require('crypto');

/**
 * Проверка подписи Telegram Web App initData (см. core.telegram.org/bots/webapps).
 * @param {string} initData — сырая строка из tg.initData
 * @param {string} botToken
 * @param {number} [maxAgeSeconds=86400]
 * @returns {{ user: object, authDate: number } | null}
 */
function validateInitData(initData, botToken, maxAgeSeconds = 86400) {
  if (!initData || !botToken) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;

  const pairs = [];
  for (const [key, value] of params.entries()) {
    if (key === 'hash') continue;
    pairs.push([key, value]);
  }
  pairs.sort((a, b) => a[0].localeCompare(b[0]));
  const dataCheckString = pairs.map(([k, v]) => `${k}=${v}`).join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hmac = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  if (hmac !== hash) return null;

  const authDate = Number(params.get('auth_date') || 0);
  if (maxAgeSeconds > 0 && authDate > 0 && Date.now() / 1000 - authDate > maxAgeSeconds) return null;

  const userRaw = params.get('user');
  if (!userRaw) return null;
  try {
    const user = JSON.parse(userRaw);
    if (!user || typeof user.id !== 'number') return null;
    const startParam = params.get('start_param') || null;
    return { user, authDate, startParam };
  } catch {
    return null;
  }
}

module.exports = { validateInitData };
