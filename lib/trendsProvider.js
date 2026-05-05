const { getRedisClient, isKvConfigured } = require('./redisClient');
const { DEFAULT_TRENDS } = require('./defaultTrends');

const KV_TRENDS_KEY = 'vm:global:trends';

function sanitizeTrends(arr) {
  if (!Array.isArray(arr)) return null;
  const out = arr
    .map((x) => ({
      name: String(x?.name || '').trim().slice(0, 80),
      score: Math.min(100, Math.max(0, Number(x?.score) || 50)),
      emoji: String(x?.emoji || '📌').trim().slice(0, 8),
    }))
    .filter((x) => x.name.length > 0);
  return out.length ? out.slice(0, 24) : null;
}

function trendsFromEnv() {
  const raw = process.env.TRENDS_JSON;
  if (!raw || typeof raw !== 'string') return null;
  try {
    return sanitizeTrends(JSON.parse(raw));
  } catch {
    return null;
  }
}

async function getTrendsList() {
  if (isKvConfigured()) {
    try {
      const kv = getRedisClient();
      if (!kv) throw new Error('Redis is not configured');
      const fromKv = await kv.get(KV_TRENDS_KEY);
      const s = sanitizeTrends(fromKv);
      if (s) return s;
    } catch (e) {
      console.error('getTrendsList kv:', e.message);
    }
  }
  const fromEnv = trendsFromEnv();
  if (fromEnv) return fromEnv;
  return DEFAULT_TRENDS;
}

module.exports = { getTrendsList, KV_TRENDS_KEY };
