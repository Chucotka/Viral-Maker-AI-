const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

describe('auth-config', () => {
  let prev;

  beforeEach(() => {
    prev = {
      token: process.env.TELEGRAM_BOT_TOKEN,
      username: process.env.TELEGRAM_BOT_USERNAME,
      webapp: process.env.WEBAPP_URL,
    };
    process.env.TELEGRAM_BOT_TOKEN = '8520170966:AAExample';
    process.env.TELEGRAM_BOT_USERNAME = 'viral_maker_ai_bot';
    process.env.WEBAPP_URL = 'https://app.innoko.ru';
  });

  afterEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = prev.token;
    process.env.TELEGRAM_BOT_USERNAME = prev.username;
    process.env.WEBAPP_URL = prev.webapp;
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
});
