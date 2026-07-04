const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { parseReferrerId, buildReferralLink, BONUS_PER_REFERRAL, MILESTONE_5 } = require('../lib/referralService');
const { isAppOwner, parseOwnerTelegramIds } = require('../lib/appOwner');
const { sendSafeError, GENERIC_MESSAGE } = require('../lib/httpErrors');
const { validateInitData } = require('../lib/telegramInitData');
const { canAccessAnalytics, planFeatureSummary } = require('../lib/planFeatures');
const { getEffectiveQuota, FREE_DAILY_LIMIT, parseLastSeenMs, countActiveSince } = require('../lib/kvUserStore');

describe('referralService', () => {
  it('parseReferrerId extracts telegram id', () => {
    assert.equal(parseReferrerId('ref_123456789'), '123456789');
    assert.equal(parseReferrerId('invalid'), null);
    assert.equal(parseReferrerId('ref_abc'), null);
  });

  it('buildReferralLink includes startapp param on /app path', () => {
    const links = buildReferralLink('999', {
      botUsername: 'test_bot',
      webAppUrl: 'https://app.innoko.ru/app/',
    });
    assert.match(links.telegramLink, /startapp=ref_999/);
    assert.match(links.webLink, /startapp=ref_999/);
    assert.match(links.webLink, /\/app\/\?startapp=ref_999/);
  });

  it('constants match product rules', () => {
    assert.equal(BONUS_PER_REFERRAL, 10);
    assert.equal(MILESTONE_5, 5);
  });
});

describe('appOwner', () => {
  it('isAppOwner respects OWNER_TELEGRAM_IDS', () => {
    const prevIds = process.env.OWNER_TELEGRAM_IDS;
    const prevId = process.env.OWNER_TELEGRAM_ID;
    delete process.env.OWNER_TELEGRAM_ID;
    process.env.OWNER_TELEGRAM_IDS = '111,222';
    assert.equal(isAppOwner('111'), true);
    assert.equal(isAppOwner('333'), false);
    assert.deepEqual(parseOwnerTelegramIds(), ['111', '222']);
    process.env.OWNER_TELEGRAM_IDS = prevIds;
    process.env.OWNER_TELEGRAM_ID = prevId;
  });

  it('isAppOwner falls back to OWNER_TELEGRAM_ID', () => {
    const prevIds = process.env.OWNER_TELEGRAM_IDS;
    const prevId = process.env.OWNER_TELEGRAM_ID;
    delete process.env.OWNER_TELEGRAM_IDS;
    process.env.OWNER_TELEGRAM_ID = '555';
    assert.equal(isAppOwner('555'), true);
    assert.equal(isAppOwner('111'), false);
    process.env.OWNER_TELEGRAM_IDS = prevIds;
    process.env.OWNER_TELEGRAM_ID = prevId;
  });
});

describe('httpErrors', () => {
  it('sendSafeError hides internal message', () => {
    const res = {
      headersSent: false,
      statusCode: 0,
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.body = payload;
      },
    };
    sendSafeError(res, new Error('secret gemini failure'), 'test');
    assert.equal(res.statusCode, 500);
    assert.equal(res.body.error, 'internal_error');
    assert.equal(res.body.message, GENERIC_MESSAGE);
    assert.notEqual(res.body.message, 'secret gemini failure');
  });
});

describe('telegramInitData', () => {
  it('rejects invalid initData', () => {
    assert.equal(validateInitData('', 'token'), null);
    assert.equal(validateInitData('user=%7B%7D', 'token'), null);
  });
});

describe('kvUserStore quota', () => {
  it('free user at generation limit cannot generate without bonus', () => {
    const rec = { plan: 'free', dailyCount: FREE_DAILY_LIMIT, bonusGenerations: 0 };
    const q = getEffectiveQuota(rec, FREE_DAILY_LIMIT);
    assert.equal(q.canGenerate, false);
    assert.equal(q.dailyRemaining, 0);
    assert.equal(q.totalRemaining, 0);
  });

  it('free user uses bonus only after free pool exhausted', () => {
    const rec = { plan: 'free', dailyCount: FREE_DAILY_LIMIT, bonusGenerations: 3 };
    const q = getEffectiveQuota(rec, FREE_DAILY_LIMIT);
    assert.equal(q.canGenerate, true);
    assert.equal(q.dailyRemaining, 0);
    assert.equal(q.totalRemaining, 3);
  });

  it('paid user has unlimited generations regardless of dailyCount', () => {
    const rec = { plan: 'pro', dailyCount: 999, bonusGenerations: 0 };
    const q = getEffectiveQuota(rec, Infinity);
    assert.equal(q.canGenerate, true);
    assert.equal(q.totalRemaining, Infinity);
  });

  it('countActiveSince respects lastSeen window', () => {
    const now = Date.now();
    const recent = { lastSeen: new Date(now - 864e5).toISOString() };
    const old = { lastSeen: new Date(now - 40 * 864e5).toISOString() };
    const since30 = now - 30 * 864e5;
    assert.equal(countActiveSince(recent, since30), true);
    assert.equal(countActiveSince(old, since30), false);
    assert.equal(Number.isNaN(parseLastSeenMs(null)), true);
  });
});

describe('planFeatures', () => {
  it('free user has no analytics', () => {
    const rec = { plan: 'free', dailyCount: 0 };
    assert.equal(canAccessAnalytics(rec), false);
    const features = planFeatureSummary(rec);
    assert.equal(features.analytics, false);
    assert.equal(features.dailyLimit, 5);
  });

  it('active pro has analytics', () => {
    const rec = {
      plan: 'pro',
      planUntil: new Date(Date.now() + 864e5).toISOString(),
    };
    assert.equal(canAccessAnalytics(rec), true);
    assert.equal(planFeatureSummary(rec).unlimitedGenerations, true);
  });
});
