const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  putImageDownload,
  getImageDownload,
  buildDownloadFileName,
  buildDownloadUrl,
} = require('../lib/tempImageDownload');

describe('tempImageDownload', () => {
  it('buildDownloadFileName picks extension from mime', () => {
    assert.equal(buildDownloadFileName('image/jpeg'), 'viral-maker-ai.jpg');
    assert.equal(buildDownloadFileName('image/png'), 'viral-maker-ai.png');
  });

  it('stores and retrieves image in memory when KV is not configured', async () => {
    const prevUrl = process.env.UPSTASH_REDIS_REST_URL;
    const prevToken = process.env.UPSTASH_REDIS_REST_TOKEN;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;

    const b64 = Buffer.from('fake-png').toString('base64');
    const token = await putImageDownload('user1', b64, 'image/png');
    const row = await getImageDownload(token);
    assert.equal(row.userId, 'user1');
    assert.equal(row.imageBase64, b64);

    process.env.UPSTASH_REDIS_REST_URL = prevUrl;
    process.env.UPSTASH_REDIS_REST_TOKEN = prevToken;
  });

  it('buildDownloadUrl uses WEBAPP_URL when set', () => {
    const prev = process.env.WEBAPP_URL;
    process.env.WEBAPP_URL = 'https://app.example.com/';
    const url = buildDownloadUrl({ get: () => null }, 'abc123');
    assert.match(url, /^https:\/\/app\.example\.com\/api\/image-download\?t=abc123$/);
    process.env.WEBAPP_URL = prev;
  });
});
