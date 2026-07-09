const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const {
  isAllowedStage,
  funnelKey,
  ALLOWED_STAGES,
} = require('../lib/funnelMetrics');

describe('funnelMetrics', () => {
  it('allows known funnel stages', () => {
    assert.equal(isAllowedStage('app_open'), true);
    assert.equal(isAllowedStage('limit_one_left'), true);
    assert.equal(isAllowedStage('unknown'), false);
    assert.ok(ALLOWED_STAGES.has('checkout_click'));
  });

  it('builds redis keys by day and stage', () => {
    assert.equal(funnelKey('2026-07-04', 'app_open'), 'vm:funnel:2026-07-04:app_open');
  });
});
