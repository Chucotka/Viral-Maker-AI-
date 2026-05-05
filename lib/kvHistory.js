const { getRedisClient } = require('./redisClient');

function getKv() {
  const redis = getRedisClient();
  if (!redis) {
    throw new Error('Redis is not configured');
  }
  return redis;
}

const PREFIX = 'vm:hist:';
const MAX_ITEMS = 50;

function sanitizeEntry(entry) {
  const o = { ...entry };
  delete o.imageBase64;
  delete o.dataUrl;
  return o;
}

async function appendUserHistory(userId, entry) {
  const kv = getKv();
  const key = PREFIX + userId;
  const raw = await kv.get(key);
  const list = Array.isArray(raw) ? raw : [];
  const ts = typeof entry.ts === 'number' ? entry.ts : Date.now();
  list.unshift(sanitizeEntry({ ...entry, ts }));
  await kv.set(key, list.slice(0, MAX_ITEMS));
}

async function getUserHistory(userId, limit = 40) {
  const kv = getKv();
  const raw = await kv.get(PREFIX + userId);
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, limit);
}

module.exports = {
  appendUserHistory,
  getUserHistory,
  MAX_ITEMS,
};
