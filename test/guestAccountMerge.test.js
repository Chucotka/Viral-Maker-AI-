const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const {
  mergeUserRecords,
  mergeHistoryLists,
  readGuestUserIdFromRequest,
} = require('../lib/guestAccountMerge');
const { signSession } = require('../lib/webSession');

describe('guestAccountMerge', () => {
  describe('mergeUserRecords', () => {
    it('keeps telegram plan when guest is free', () => {
      const tg = { plan: 'pro', planUntil: '2099-01-01T00:00:00.000Z', dailyCount: 2 };
      const guest = { plan: 'free', dailyCount: 5, niche: 'fitness' };
      const merged = mergeUserRecords(guest, tg);
      assert.equal(merged.plan, 'pro');
      assert.equal(merged.dailyCount, 5);
      assert.equal(merged.niche, 'fitness');
    });

    it('promotes guest pro when telegram is free', () => {
      const guest = { plan: 'pro', planUntil: '2099-06-01T00:00:00.000Z', dailyCount: 1 };
      const tg = { plan: 'free', dailyCount: 0 };
      const merged = mergeUserRecords(guest, tg);
      assert.equal(merged.plan, 'pro');
      assert.equal(merged.planUntil, guest.planUntil);
    });

    it('sums bonus generations and merges referral flags', () => {
      const guest = {
        bonusGenerations: 3,
        referralCount: 2,
        referralMilestone5: true,
        unseenReferralRewards: ['a'],
      };
      const tg = {
        bonusGenerations: 5,
        referralCount: 1,
        referralMilestone10: true,
        unseenReferralRewards: ['b'],
      };
      const merged = mergeUserRecords(guest, tg);
      assert.equal(merged.bonusGenerations, 8);
      assert.equal(merged.referralCount, 2);
      assert.equal(merged.referralMilestone5, true);
      assert.equal(merged.referralMilestone10, true);
      assert.deepEqual(new Set(merged.unseenReferralRewards), new Set(['a', 'b']));
    });
  });

  describe('mergeHistoryLists', () => {
    it('deduplicates by type and ts, newest first', () => {
      const guest = [{ ts: 100, type: 'text', prompt: 'a' }];
      const tg = [{ ts: 200, type: 'text', prompt: 'b' }, { ts: 100, type: 'text', prompt: 'dup' }];
      const merged = mergeHistoryLists(guest, tg);
      assert.equal(merged.length, 2);
      assert.equal(merged[0].ts, 200);
      assert.equal(merged[1].prompt, 'a');
    });
  });

  describe('readGuestUserIdFromRequest', () => {
    let prevSecret;

    beforeEach(() => {
      prevSecret = process.env.SESSION_SECRET;
      process.env.SESSION_SECRET = 'test-session-secret-guest-merge';
    });

    afterEach(() => {
      process.env.SESSION_SECRET = prevSecret;
    });

    it('returns guest id from guest session cookie', () => {
      const token = signSession({
        userId: 'web_abc',
        user: { id: 'web_abc', is_guest: true },
        authKind: 'guest',
      });
      const req = { headers: { cookie: `vm_session=${encodeURIComponent(token)}` } };
      assert.equal(readGuestUserIdFromRequest(req), 'web_abc');
    });

    it('returns null for telegram session', () => {
      const token = signSession({
        userId: '42',
        user: { id: 42, first_name: 'Ann' },
        authKind: 'telegram',
      });
      const req = { headers: { cookie: `vm_session=${encodeURIComponent(token)}` } };
      assert.equal(readGuestUserIdFromRequest(req), null);
    });
  });
});
