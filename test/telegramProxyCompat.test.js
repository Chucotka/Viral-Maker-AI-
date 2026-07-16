const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

describe('telegram proxy compatibility', () => {
  it('index.html does not load telegram.org SDK directly', () => {
    const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
    assert.doesNotMatch(
      html,
      /src="https:\/\/telegram\.org\/js\/telegram-web-app\.js"/,
      'direct telegram.org blocks Mini App when user proxy blocks telegram.org',
    );
    assert.match(html, /telegram-boot\.js/);
  });

  it('self-hosts telegram SDK files', () => {
    const appJs = path.join(__dirname, '../public/js/telegram-web-app.js');
    const widgetJs = path.join(__dirname, '../public/js/telegram-widget.js');
    assert.ok(fs.existsSync(appJs));
    assert.ok(fs.existsSync(widgetJs));
    assert.ok(fs.statSync(appJs).size > 10000);
    assert.ok(fs.statSync(widgetJs).size > 1000);
  });

  it('telegram-boot loads local SDK, not telegram.org', () => {
    const boot = fs.readFileSync(path.join(__dirname, '../public/js/telegram-boot.js'), 'utf8');
    assert.match(boot, /js\/telegram-web-app\.js/);
    assert.doesNotMatch(boot, /https:\/\/telegram\.org\/js\/telegram-web-app/);
  });

  it('web-auth does not load telegram.org widget', () => {
    const src = fs.readFileSync(path.join(__dirname, '../public/js/web-auth.js'), 'utf8');
    assert.doesNotMatch(src, /telegram\.org\/js\/telegram-widget/);
  });

  it('nginx proxies tg-oauth and tg-cdn', () => {
    const conf = fs.readFileSync(path.join(__dirname, '../scripts/nginx-innoko-locations.conf'), 'utf8');
    assert.match(conf, /location \/tg-oauth\//);
    assert.match(conf, /location \/tg-cdn\//);
  });
});
