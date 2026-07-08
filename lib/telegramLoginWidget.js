const crypto = require('crypto');

/**
 * Проверка данных Telegram Login Widget.
 * @see https://core.telegram.org/widgets/login#checking-authorization
 */
function validateTelegramLoginWidget(data, botToken, maxAgeSeconds = 86400) {
  if (!data || typeof data !== 'object' || !botToken) return null;
  const hash = String(data.hash || '');
  if (!hash) return null;

  const fields = { ...data };
  delete fields.hash;

  const checkString = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join('\n');

  const secretKey = crypto.createHash('sha256').update(botToken).digest();
  const hmac = crypto.createHmac('sha256', secretKey).update(checkString).digest('hex');
  if (hmac !== hash) return null;

  const authDate = Number(fields.auth_date || 0);
  if (maxAgeSeconds > 0 && authDate > 0 && Date.now() / 1000 - authDate > maxAgeSeconds) return null;

  const id = Number(fields.id);
  if (!Number.isFinite(id) || id <= 0) return null;

  return {
    user: {
      id,
      first_name: fields.first_name ? String(fields.first_name) : '',
      last_name: fields.last_name ? String(fields.last_name) : undefined,
      username: fields.username ? String(fields.username) : undefined,
      photo_url: fields.photo_url ? String(fields.photo_url) : undefined,
    },
    authDate,
  };
}

module.exports = { validateTelegramLoginWidget };
