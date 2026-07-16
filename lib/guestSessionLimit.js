const { getRedisClient, isKvConfigured } = require('./redisClient');

const DEFAULT_GUEST_SESSIONS_PER_IP_DAY = 3;

function guestSessionsPerIpDay() {
  const n = Number(process.env.GUEST_SESSIONS_PER_IP_DAY);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_GUEST_SESSIONS_PER_IP_DAY;
}

function readClientIp(req) {
  const xf = req?.headers?.['x-forwarded-for'] || req?.headers?.['X-Forwarded-For'];
  if (xf) {
    const first = String(xf).split(',')[0].trim();
    if (first) return first.slice(0, 64);
  }
  const xr = req?.headers?.['x-real-ip'] || req?.headers?.['X-Real-IP'];
  if (xr) return String(xr).trim().slice(0, 64);
  const remote = req?.socket?.remoteAddress;
  if (remote) return String(remote).slice(0, 64);
  return 'unknown';
}

function dayBucketUtc() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Учитывает создание новой гостевой сессии web_* с IP.
 * @returns {Promise<{ ok: true } | { ok: false, error: 'guest_ip_limit', message: string }>}
 */
async function registerNewGuestSession(req) {
  if (!isKvConfigured()) return { ok: true };

  const ip = readClientIp(req);
  if (!ip || ip === 'unknown') return { ok: true };

  const max = guestSessionsPerIpDay();
  const key = `vm:guest_ip:${ip}:${dayBucketUtc()}`;

  try {
    const kv = getRedisClient();
    if (!kv) return { ok: true };
    const n = await kv.incr(key);
    if (n === 1) await kv.expire(key, 86400 * 2);
    if (n > max) {
      return {
        ok: false,
        error: 'guest_ip_limit',
        message:
          `С этого подключения уже создано ${max} пробных аккаунта за сутки. ` +
          'Войдите через Telegram — прогресс сохранится на всех устройствах.',
      };
    }
    return { ok: true };
  } catch (e) {
    console.error('registerNewGuestSession:', e.message);
    return { ok: true };
  }
}

module.exports = {
  guestSessionsPerIpDay,
  readClientIp,
  registerNewGuestSession,
};
