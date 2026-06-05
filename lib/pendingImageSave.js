const { getRedisClient, isKvConfigured } = require('./redisClient');

const PREFIX = 'vm:pendingsave:';
const TTL_SEC = 3600;

/** @type {Map<string, { token: string, expires: number }>} */
const memoryPending = new Map();

async function setPendingImageSave(userId, downloadToken) {
  const uid = String(userId);
  const token = String(downloadToken || '').trim();
  if (!uid || !token) return;

  if (isKvConfigured()) {
    const kv = getRedisClient();
    if (kv) await kv.set(PREFIX + uid, { token, ts: Date.now() }, { ex: TTL_SEC });
    return;
  }
  memoryPending.set(uid, { token, expires: Date.now() + TTL_SEC * 1000 });
}

async function getPendingImageSave(userId) {
  const uid = String(userId);
  if (!uid) return null;

  if (isKvConfigured()) {
    const kv = getRedisClient();
    if (!kv) return null;
    const raw = await kv.get(PREFIX + uid);
    if (!raw || typeof raw !== 'object') return null;
    return String(raw.token || '').trim() || null;
  }

  const row = memoryPending.get(uid);
  if (!row || row.expires <= Date.now()) {
    memoryPending.delete(uid);
    return null;
  }
  return row.token;
}

async function clearPendingImageSave(userId) {
  const uid = String(userId);
  if (!uid) return;
  if (isKvConfigured()) {
    const kv = getRedisClient();
    if (kv) await kv.del(PREFIX + uid);
    return;
  }
  memoryPending.delete(uid);
}

function botStartSaveLink() {
  const username = String(process.env.TELEGRAM_BOT_USERNAME || 'viral_maker_ai_bot').replace(/^@+/, '');
  return username ? `https://t.me/${username}?start=save_image` : null;
}

module.exports = {
  setPendingImageSave,
  getPendingImageSave,
  clearPendingImageSave,
  botStartSaveLink,
  TTL_SEC,
};
