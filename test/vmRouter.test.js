const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const TABS = ['dashboard', 'studio', 'trends', 'analytics', 'settings'];

function parseHash(hash) {
  const raw = String(hash || '').replace(/^#\/?/, '').trim();
  if (!raw) return 'dashboard';
  const tab = raw.split(/[/?#]/)[0].toLowerCase();
  return TABS.includes(tab) ? tab : 'dashboard';
}

describe('vm-router hash paths', () => {
  it('parses #/dashboard', () => {
    assert.equal(parseHash('#/dashboard'), 'dashboard');
  });

  it('parses #/studio', () => {
    assert.equal(parseHash('#/studio'), 'studio');
  });

  it('defaults empty hash to dashboard', () => {
    assert.equal(parseHash(''), 'dashboard');
    assert.equal(parseHash('#/'), 'dashboard');
  });

  it('falls back unknown routes to dashboard', () => {
    assert.equal(parseHash('#/unknown'), 'dashboard');
  });
});
