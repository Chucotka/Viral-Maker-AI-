const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

describe('stabilization (no-VPN load)', () => {
  it('index.html does not load telegram.org SDK directly', () => {
    const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
    assert.doesNotMatch(
      html,
      /src="https:\/\/telegram\.org\/js\/telegram-web-app\.js"/,
      'direct telegram.org blocks browsers without VPN',
    );
    assert.match(html, /tg-cdn\/js\/telegram-web-app\.js|inTelegramClient|vm-telegram-mini-app/);
  });

  it('index.html never replaces injected Telegram Mini App session', () => {
    const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
    assert.match(html, /tg\.initData/);
    assert.doesNotMatch(
      html,
      /if \(!inTelegram\) \{\s*window\.Telegram = \{/,
    );
  });

  it('deploy script defaults to stabilization branch', () => {
    const sh = fs.readFileSync(path.join(__dirname, '../scripts/deploy-vps-update.sh'), 'utf8');
    assert.match(sh, /cursor\/stabilization-e202/);
    assert.match(sh, /stabilization-smoke\.js/);
  });
});
