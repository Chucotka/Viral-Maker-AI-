const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

describe('nginx Manus map', () => {
  it('maps viral-maker.ru to configurable Manus host', () => {
    const map = fs.readFileSync(path.join(__dirname, '../scripts/nginx-manus-map.conf'), 'utf8');
    assert.match(map, /viral-maker\.ru __VIRAL_MAKER_MANUS_HOST__/);
    assert.match(map, /innoko\.ru innokoai\.manus\.space/);
  });

  it('locations use manus_proxy_host variable', () => {
    const loc = fs.readFileSync(path.join(__dirname, '../scripts/nginx-innoko-locations.conf'), 'utf8');
    assert.match(loc, /\$manus_proxy_host/);
    assert.match(loc, /app\.viral-maker\.ru/);
  });
});
