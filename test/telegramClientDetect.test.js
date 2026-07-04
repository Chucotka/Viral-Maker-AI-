const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  isInsideTelegramClient,
  isTelegramMiniAppContext,
  shouldInstallWebStub,
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

  it('treats initData as authenticated Mini App', () => {
    assert.equal(isTelegramMiniAppContext({ initData: 'user=...&hash=abc' }), true);
    assert.equal(isTelegramMiniAppContext({ initData: '' }), false);
  });

  it('does not install web stub for Mini App or Telegram browser', () => {
    assert.equal(shouldInstallWebStub({ initData: 'signed' }), false);
    assert.equal(
      shouldInstallWebStub({ userAgent: 'Mozilla/5.0 Telegram/10.0' }),
      false,
    );
    assert.equal(
      shouldInstallWebStub({ userAgent: 'Chrome', search: '?tgWebAppData=1' }),
      false,
    );
    assert.equal(shouldInstallWebStub({ userAgent: 'Chrome Desktop' }), true);
  });

  it('blocks tg:// navigation inside Telegram or Mini App', () => {
    assert.equal(
      shouldBlockInAppTelegramNavigation('Mozilla/5.0 Telegram/10.0', false),
      true,
    );
    assert.equal(shouldBlockInAppTelegramNavigation('Chrome', 'user=abc'), true);
    assert.equal(shouldBlockInAppTelegramNavigation('Chrome', ''), false);
  });
});
