const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { buildTelegramMiniAppOpenUrl } = require('../lib/telegramAppLink');

describe('telegramAppLink', () => {
  it('builds direct mini app link by default', () => {
    const url = buildTelegramMiniAppOpenUrl(null, { botUsername: 'viral_maker_ai_bot' });
    assert.equal(url, 'https://t.me/viral_maker_ai_bot/app');
  });

  it('passes referral startapp param', () => {
    const url = buildTelegramMiniAppOpenUrl('ref_42', { botUsername: 'viral_maker_ai_bot' });
    assert.equal(url, 'https://t.me/viral_maker_ai_bot/app?startapp=ref_42');
  });

  it('uses custom short name from env', () => {
    const prev = process.env.TELEGRAM_MINI_APP_SHORT_NAME;
    process.env.TELEGRAM_MINI_APP_SHORT_NAME = 'viralmaker';
    try {
      const url = buildTelegramMiniAppOpenUrl('ref_1', { botUsername: 'bot' });
      assert.equal(url, 'https://t.me/bot/viralmaker?startapp=ref_1');
    } finally {
      if (prev === undefined) delete process.env.TELEGRAM_MINI_APP_SHORT_NAME;
      else process.env.TELEGRAM_MINI_APP_SHORT_NAME = prev;
    }
  });
});
