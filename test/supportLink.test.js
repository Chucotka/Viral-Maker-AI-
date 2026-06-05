const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { buildSupportChatLink } = require('../lib/supportLink');

describe('supportLink', () => {
  it('buildSupportChatLink uses SUPPORT_TELEGRAM_USERNAME when set', () => {
    const prevSupport = process.env.SUPPORT_TELEGRAM_USERNAME;
    const prevBot = process.env.TELEGRAM_BOT_USERNAME;
    process.env.SUPPORT_TELEGRAM_USERNAME = '@my_support';
    delete process.env.TELEGRAM_BOT_USERNAME;
    try {
      assert.equal(buildSupportChatLink(), 'https://t.me/my_support?start=support');
    } finally {
      if (prevSupport == null) delete process.env.SUPPORT_TELEGRAM_USERNAME;
      else process.env.SUPPORT_TELEGRAM_USERNAME = prevSupport;
      if (prevBot == null) delete process.env.TELEGRAM_BOT_USERNAME;
      else process.env.TELEGRAM_BOT_USERNAME = prevBot;
    }
  });
});
