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

function applyHistoryMutation(entry, mutation = {}) {
  const set = mutation && typeof mutation.set === 'object' ? mutation.set : {};
  const increments = mutation && typeof mutation.increments === 'object' ? mutation.increments : {};
  const next = { ...entry };
  for (const [key, value] of Object.entries(set)) {
    next[key] = value;
  }
  for (const [key, value] of Object.entries(increments)) {
    const delta = Number(value);
    if (!Number.isFinite(delta) || delta === 0) continue;
    const current = Number(next[key]) || 0;
    next[key] = current + delta;
  }
  return sanitizeEntry(next);
}

async function getUserHistory(userId, limit = 40) {
  const kv = getKv();
  const raw = await kv.get(PREFIX + userId);
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, limit);
}

async function updateUserHistoryEntry(userId, ts, mutation = {}) {
  const kv = getKv();
  const key = PREFIX + userId;
  const raw = await kv.get(key);
  const list = Array.isArray(raw) ? raw : [];
  const targetTs = Number(ts);
  if (!Number.isFinite(targetTs)) return null;
  const index = list.findIndex((item) => Number(item?.ts) === targetTs);
  if (index < 0) return null;
  const updated = applyHistoryMutation(list[index], mutation);
  list[index] = updated;
  await kv.set(key, list.slice(0, MAX_ITEMS));
  return updated;
}

module.exports = {
  appendUserHistory,
  getUserHistory,
  updateUserHistoryEntry,
  MAX_ITEMS,
};
