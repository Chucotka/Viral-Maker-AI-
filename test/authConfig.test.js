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
    process.env.WEBAPP_URL = 'https://app.innoko.ru/app';
  });

  afterEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = prev.token;
    process.env.TELEGRAM_BOT_USERNAME = prev.username;
    process.env.WEBAPP_URL = prev.webapp;
    if (prev.botId) process.env.TELEGRAM_BOT_ID = prev.botId;
    else delete process.env.TELEGRAM_BOT_ID;
  });

  it('returns app.innoko.ru urls', async () => {
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
    assert.equal(body.webAppUrl, 'https://app.innoko.ru/app/');
    assert.equal(body.telegramMiniAppUrl, 'https://t.me/viral_maker_ai_bot/app');
    assert.equal(body.callbackUrl, 'https://app.innoko.ru/api/auth/telegram-callback');
  });
});
