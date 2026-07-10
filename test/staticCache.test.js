const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { setStaticCacheHeaders } = require('../lib/staticCache');

describe('staticCache', () => {
  it('no-cache for html', () => {
    const headers = {};
    setStaticCacheHeaders({ setHeader(k, v) { headers[k] = v; } }, '/app/index.html');
    assert.equal(headers['Cache-Control'], 'no-cache');
  });

  it('long cache for js and css', () => {
    const headers = {};
    setStaticCacheHeaders({ setHeader(k, v) { headers[k] = v; } }, '/app/js/app.js');
    assert.match(headers['Cache-Control'], /max-age=604800/);
  });
});
