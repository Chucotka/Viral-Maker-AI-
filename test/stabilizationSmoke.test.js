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
    assert.match(html, /telegram-boot\.js|tg-cdn\/js\/telegram-web-app\.js|js\/telegram-web-app\.js/);
  });

  it('loads telegram-boot.js and self-hosted SDK path', () => {
    const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
    assert.match(html, /telegram-boot\.js/);
    assert.match(fs.readFileSync(path.join(__dirname, '../public/js/telegram-boot.js'), 'utf8'), /js\/telegram-web-app\.js/);
    assert.ok(fs.existsSync(path.join(__dirname, '../public/js/telegram-web-app.js')));
  });

  it('deploy script defaults to product growth branch', () => {
    const sh = fs.readFileSync(path.join(__dirname, '../scripts/deploy-vps-update.sh'), 'utf8');
    assert.match(sh, /cursor\/fix-generate-500-e202/);
    assert.match(sh, /stabilization-smoke\.js/);
  });
});
