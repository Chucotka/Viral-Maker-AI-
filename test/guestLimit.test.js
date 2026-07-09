const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  guestSessionsPerIpDay,
  readClientIp,
} = require('../lib/guestSessionLimit');
const { guestFreeGenerationLimit, isGuestUserId } = require('../lib/webGuest');
const { freeGenerationLimitForUser, getEffectiveQuota, FREE_GENERATION_LIMIT } = require('../lib/kvUserStore');

describe('guest abuse limits', () => {
  it('guest free pool is 3 by default', () => {
    assert.equal(guestFreeGenerationLimit(), 3);
    assert.equal(freeGenerationLimitForUser('web_abc'), 3);
    assert.equal(freeGenerationLimitForUser('123456789'), FREE_GENERATION_LIMIT);
  });

  it('guest quota uses limit 3', () => {
    const rec = { plan: 'free', dailyCount: 2, bonusGenerations: 0 };
    const q = getEffectiveQuota(rec, freeGenerationLimitForUser('web_test'));
    assert.equal(q.dailyRemaining, 1);
    assert.equal(q.totalRemaining, 1);
  });

  it('telegram user keeps limit 5', () => {
    const rec = { plan: 'free', dailyCount: 0, bonusGenerations: 0 };
    const q = getEffectiveQuota(rec, freeGenerationLimitForUser('999'));
    assert.equal(q.totalRemaining, 5);
  });

  it('isGuestUserId detects web_ prefix', () => {
    assert.equal(isGuestUserId('web_uuid'), true);
    assert.equal(isGuestUserId('42'), false);
  });

  it('readClientIp prefers x-forwarded-for first hop', () => {
    const ip = readClientIp({
      headers: { 'x-forwarded-for': '203.0.113.1, 10.0.0.1' },
      socket: { remoteAddress: '127.0.0.1' },
    });
    assert.equal(ip, '203.0.113.1');
  });

  it('guest sessions per ip default is 3', () => {
    assert.equal(guestSessionsPerIpDay(), 3);
  });
});
