const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('health endpoint', () => {
  it('returns service checks json', async () => {
    const prev = {
      gemini: process.env.GEMINI_API_KEY,
      bot: process.env.TELEGRAM_BOT_TOKEN,
    };
    process.env.GEMINI_API_KEY = 'test';
    process.env.TELEGRAM_BOT_TOKEN = 'test';

    const handler = require('../api/health');
    let body;
    const res = {
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(data) {
        body = data;
      },
    };
    await handler({ method: 'GET' }, res);
    assert.ok('redis' in body);
    assert.ok('gemini' in body);
    assert.ok('ts' in body);

    process.env.GEMINI_API_KEY = prev.gemini;
    process.env.TELEGRAM_BOT_TOKEN = prev.bot;
  });
});
