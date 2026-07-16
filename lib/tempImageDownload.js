const crypto = require('crypto');
const { getRedisClient, isKvConfigured } = require('./redisClient');

const PREFIX = 'vm:imgdl:';
const TTL_SEC = 600;
const MAX_BYTES = 8 * 1024 * 1024;

/** @type {Map<string, { userId: string, imageBase64: string, mimeType: string, expires: number }>} */
const memoryStore = new Map();

function estimateBase64Bytes(b64) {
  const len = String(b64 || '').length;
  return Math.floor((len * 3) / 4);
}

function pruneMemory() {
  const now = Date.now();
  for (const [key, val] of memoryStore.entries()) {
    if (!val || val.expires <= now) memoryStore.delete(key);
  }
}

function newToken() {
  return crypto.randomBytes(18).toString('base64url');
}

async function putImageDownload(userId, imageBase64, mimeType) {
  const b64 = String(imageBase64 || '');
  if (!b64) throw new Error('empty_image');
  if (estimateBase64Bytes(b64) > MAX_BYTES) throw new Error('image_too_large');

  const token = newToken();
  const payload = {
    userId: String(userId),
    imageBase64: b64,
    mimeType: String(mimeType || 'image/png').slice(0, 64),
  };

  if (isKvConfigured()) {
    const kv = getRedisClient();
    if (!kv) throw new Error('Redis is not configured');
    await kv.set(PREFIX + token, payload, { ex: TTL_SEC });
    return token;
  }

  pruneMemory();
  memoryStore.set(token, { ...payload, expires: Date.now() + TTL_SEC * 1000 });
  return token;
}

async function getImageDownload(token) {
  const id = String(token || '').trim();
  if (!id || id.length > 64) return null;

  if (isKvConfigured()) {
    const kv = getRedisClient();
    if (!kv) return null;
    const raw = await kv.get(PREFIX + id);
    if (!raw || typeof raw !== 'object') return null;
    return raw;
  }

  pruneMemory();
  const row = memoryStore.get(id);
  if (!row || row.expires <= Date.now()) {
    memoryStore.delete(id);
    return null;
  }
  return row;
}

function buildDownloadFileName(mimeType) {
  const mt = String(mimeType || '').toLowerCase();
  if (mt.includes('jpeg') || mt.includes('jpg')) return 'viral-maker-ai.jpg';
  if (mt.includes('webp')) return 'viral-maker-ai.webp';
  return 'viral-maker-ai.png';
}

function publicBaseUrl(req) {
  const fromEnv = String(process.env.WEBAPP_URL || '').trim().replace(/\/$/, '');
  if (fromEnv) return fromEnv;
  const host = req.get('x-forwarded-host') || req.get('host');
  if (!host) return '';
  const proto = req.get('x-forwarded-proto') || 'https';
  return `${proto}://${host}`;
}

function buildDownloadUrl(req, token) {
  const base = publicBaseUrl(req);
  if (!base || !token) return null;
  return `${base}/api/image-download?t=${encodeURIComponent(token)}`;
}

module.exports = {
  putImageDownload,
  getImageDownload,
  buildDownloadFileName,
  buildDownloadUrl,
  publicBaseUrl,
  estimateBase64Bytes,
  MAX_BYTES,
};
