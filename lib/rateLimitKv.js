const { getRedisClient, isKvConfigured } = require('./redisClient');
const { sendClientError } = require('./httpErrors');

function baseGeneratePerMinute() {
  const n = Number(process.env.GENERATE_RATE_PER_MINUTE);
  return Number.isFinite(n) && n > 0 ? n : 15;
}

/** Premium: базовый лимит × множитель (снижает трение при активной студии). */
function maxPerMinuteForPlan(plan) {
  const base = baseGeneratePerMinute();
  if (plan === 'premium') {
    const mul = Number(process.env.RATE_PREMIUM_MULTIPLIER);
    const m = Number.isFinite(mul) && mul > 0 ? mul : 2;
    return Math.max(base, Math.floor(base * m));
  }
  return base;
}

/** @returns {Promise<boolean>} false если уже отправлен 429/503 */
async function assertGenerateRateLimit(userId, res, plan = 'free') {
  if (!isKvConfigured()) return true;
  const max = maxPerMinuteForPlan(plan);
  try {
    const kv = getRedisClient();
    if (!kv) {
      sendClientError(res, 503, 'rate_limit_unavailable', 'Сервис временно недоступен. Попробуйте через минуту.');
      return false;
    }
    const bucket = Math.floor(Date.now() / 60000);
    const key = `vm:rl:g:${userId}:${bucket}`;
    const n = await kv.incr(key);
    if (n === 1) await kv.expire(key, 90);
    if (n > max) {
      res.status(429).json({
        error: 'rate_limit',
        message: 'Слишком много запросов за минуту. Подождите немного.',
      });
      return false;
    }
  } catch (e) {
    console.error('assertGenerateRateLimit:', e.message);
    sendClientError(res, 503, 'rate_limit_unavailable', 'Сервис временно недоступен. Попробуйте через минуту.');
    return false;
  }
  return true;
}

module.exports = { assertGenerateRateLimit, baseGeneratePerMinute, maxPerMinuteForPlan };
