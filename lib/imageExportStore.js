const crypto = require('crypto');
const { getRedisClient, isKvConfigured } = require('./redisClient');

const PREFIX = 'vm:imgexp:';
const TTL_SEC = 300;
const MAX_BYTES = 8 * 1024 * 1024;

function exportKey(token) {
  return PREFIX + token;
}

async function createImageExport({ userId, mimeType, dataBase64, fileName }) {
  if (!isKvConfigured()) {
    throw new Error('Redis is not configured');
  }
  const buf = Buffer.from(String(dataBase64 || ''), 'base64');
  if (!buf.length) throw new Error('empty_image');
  if (buf.length > MAX_BYTES) throw new Error('image_too_large');

  const token = crypto.randomBytes(24).toString('hex');
  const kv = getRedisClient();
  await kv.set(
    exportKey(token),
    {
      userId: String(userId),
      mimeType: String(mimeType || 'image/png'),
      dataBase64: buf.toString('base64'),
      fileName: String(fileName || 'viral-maker-ai.png').slice(0, 120),
      createdAt: Date.now(),
    },
    { ex: TTL_SEC },
  );
  return { token, expiresInSec: TTL_SEC };
}

async function consumeImageExport(token) {
  if (!isKvConfigured()) return null;
  const clean = String(token || '').replace(/[^a-f0-9]/gi, '');
  if (clean.length < 32) return null;
  const kv = getRedisClient();
  const key = exportKey(clean);
  const raw = await kv.get(key);
  if (!raw || typeof raw !== 'object') return null;
  await kv.del(key);
  const buf = Buffer.from(String(raw.dataBase64 || ''), 'base64');
  if (!buf.length) return null;
  return {
    mimeType: String(raw.mimeType || 'image/png'),
    fileName: String(raw.fileName || 'viral-maker-ai.png'),
    buffer: buf,
  };
}

module.exports = {
  createImageExport,
  consumeImageExport,
  TTL_SEC,
  MAX_BYTES,
};
