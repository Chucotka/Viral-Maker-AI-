const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

describe('auth-config', () => {
  let prev;

  beforeEach(() => {
    prev = {
      token: process.env.TELEGRAM_BOT_TOKEN,
      botId: process.env.TELEGRAM_BOT_ID,
      username: process.env.TELEGRAM_BOT_USERNAME,
      webapp: process.env.WEBAPP_URL,
    };
    process.env.TELEGRAM_BOT_TOKEN = '8520170966:AAExample';
    delete process.env.TELEGRAM_BOT_ID;
    process.env.TELEGRAM_BOT_USERNAME = 'viral_maker_ai_bot';
    process.env.WEBAPP_URL = 'https://app.innoko.ru';
  });

  afterEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = prev.token;
    process.env.TELEGRAM_BOT_USERNAME = prev.username;
    process.env.WEBAPP_URL = prev.webapp;
    if (prev.botId) process.env.TELEGRAM_BOT_ID = prev.botId;
    else delete process.env.TELEGRAM_BOT_ID;
  });

  it('returns full bot id and loginUrl', async () => {
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
    assert.match(body.loginUrl, /bot_id=8520170966/);
    assert.equal(body.telegramBotUrl, 'https://t.me/viral_maker_ai_bot');
  });

  it('prefers TELEGRAM_BOT_ID over token prefix', async () => {
    process.env.TELEGRAM_BOT_ID = '8520170966';
    process.env.TELEGRAM_BOT_TOKEN = '520170966:broken';
    const handler = require('../api/auth-config');
    let body;
    const res = { json(d) { body = d; }, status() { return this; } };
    await handler({ method: 'GET' }, res);
    assert.equal(body.botId, '8520170966');
    assert.match(body.loginUrl, /bot_id=8520170966/);
  });
});
