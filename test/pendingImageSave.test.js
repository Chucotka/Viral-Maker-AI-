const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { botStartSaveLink } = require('../lib/pendingImageSave');

describe('pendingImageSave', () => {
  it('botStartSaveLink includes save_image payload', () => {
    const prev = process.env.TELEGRAM_BOT_USERNAME;
    process.env.TELEGRAM_BOT_USERNAME = 'viral_maker_ai_bot';
    try {
      assert.equal(botStartSaveLink(), 'https://t.me/viral_maker_ai_bot?start=save_image');
    } finally {
      if (prev == null) delete process.env.TELEGRAM_BOT_USERNAME;
      else process.env.TELEGRAM_BOT_USERNAME = prev;
    }
  });
});
