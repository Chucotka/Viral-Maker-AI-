const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  isInsideTelegramClient,
  shouldBlockInAppTelegramNavigation,
} = require('../lib/telegramClientDetect');

describe('telegramClientDetect', () => {
  it('detects Telegram in-app browser UA', () => {
    assert.equal(
      isInsideTelegramClient('Mozilla/5.0 Telegram/10.0 iPhone'),
      true,
    );
  });

  it('does not flag normal mobile Chrome', () => {
    assert.equal(
      isInsideTelegramClient('Mozilla/5.0 (Linux; Android 13) Chrome/120 Mobile'),
      false,
    );
  });

  it('blocks tg:// navigation inside Telegram or Mini App', () => {
    assert.equal(
      shouldBlockInAppTelegramNavigation('Mozilla/5.0 Telegram/10.0', false),
      true,
    );
    assert.equal(shouldBlockInAppTelegramNavigation('Chrome', true), true);
    assert.equal(shouldBlockInAppTelegramNavigation('Chrome', false), false);
  });
});
