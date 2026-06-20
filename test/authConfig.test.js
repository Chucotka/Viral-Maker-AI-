const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

describe('auth-config', () => {
  let prev;

  beforeEach(() => {
    prev = {
      token: process.env.TELEGRAM_BOT_TOKEN,
      username: process.env.TELEGRAM_BOT_USERNAME,
    };
    process.env.TELEGRAM_BOT_TOKEN = '8520170966:AAExample';
    process.env.TELEGRAM_BOT_USERNAME = 'viral_maker_ai_bot';
  });

  afterEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = prev.token;
    process.env.TELEGRAM_BOT_USERNAME = prev.username;
  });

  it('returns bot id from token prefix', async () => {
    const handler = require('../api/auth-config');
    let body;
    const res = {
      json(data) {
        body = data;
      },
      status() {
        return this;
      },
    };
    await handler({ method: 'GET' }, res);
    assert.equal(body.botId, '8520170966');
    assert.equal(body.botUsername, 'viral_maker_ai_bot');
  });
});
