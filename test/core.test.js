const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { parseReferrerId, buildReferralLink, BONUS_PER_REFERRAL, MILESTONE_5 } = require('../lib/referralService');
const { isAppOwner, parseOwnerTelegramIds } = require('../lib/appOwner');
const { sendSafeError, GENERIC_MESSAGE } = require('../lib/httpErrors');
const { validateInitData } = require('../lib/telegramInitData');
const { canAccessAnalytics, planFeatureSummary } = require('../lib/planFeatures');

describe('referralService', () => {
  it('parseReferrerId extracts telegram id', () => {
    assert.equal(parseReferrerId('ref_123456789'), '123456789');
    assert.equal(parseReferrerId('invalid'), null);
    assert.equal(parseReferrerId('ref_abc'), null);
  });

  it('buildReferralLink includes startapp param', () => {
    const links = buildReferralLink('999', { botUsername: 'test_bot', webAppUrl: 'https://example.com' });
    assert.match(links.telegramLink, /startapp=ref_999/);
    assert.match(links.webLink, /startapp=ref_999/);
  });

  it('constants match product rules', () => {
    assert.equal(BONUS_PER_REFERRAL, 10);
    assert.equal(MILESTONE_5, 5);
  });
});

describe('appOwner', () => {
  it('isAppOwner respects OWNER_TELEGRAM_IDS', () => {
    const prev = process.env.OWNER_TELEGRAM_IDS;
    process.env.OWNER_TELEGRAM_IDS = '111,222';
    assert.equal(isAppOwner('111'), true);
    assert.equal(isAppOwner('333'), false);
    assert.deepEqual(parseOwnerTelegramIds(), ['111', '222']);
    process.env.OWNER_TELEGRAM_IDS = prev;
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
