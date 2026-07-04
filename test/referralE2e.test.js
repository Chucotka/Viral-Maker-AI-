const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

describe('auth-session startapp', () => {
  let prevSecret;

  beforeEach(() => {
    prevSecret = process.env.SESSION_SECRET;
    process.env.SESSION_SECRET = 'test-session-secret-for-guest';
  });

  afterEach(() => {
    if (prevSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = prevSecret;
  });

  it('creates guest session when no cookie', async () => {
    const handler = require('../api/auth-session');
    let body;
    const headers = {};
    const res = {
      json(data) {
        body = data;
      },
      setHeader(name, value) {
        headers[name.toLowerCase()] = value;
      },
      status() {
        return this;
      },
    };
    await handler({ method: 'GET', headers: {}, query: {} }, res);
    assert.equal(body.authenticated, true);
    assert.equal(body.isGuest, true);
    assert.match(body.userId, /^web_/);
    assert.match(headers['set-cookie'], /vm_session=/);
    assert.equal(body.startParam, null);
  });

  it('stores referral startapp in new guest session', async () => {
    const handler = require('../api/auth-session');
    let body;
    const res = {
      json(data) {
        body = data;
      },
      setHeader() {},
      status() {
        return this;
      },
    };
    await handler(
      { method: 'GET', headers: {}, query: { startapp: 'ref_123456789' } },
      res,
    );
    assert.equal(body.startParam, 'ref_123456789');
    assert.equal(body.isGuest, true);
  });

  it('ignores invalid startapp values', async () => {
    const { readStartParamFromQuery } = require('../api/auth-session');
    const req = { query: { startapp: 'not_a_ref' } };
    assert.equal(readStartParamFromQuery(req), null);
  });

  it('adds startapp to existing telegram session', async () => {
    const { signSession } = require('../lib/webSession');
    const handler = require('../api/auth-session');
    const token = signSession({
      userId: '555',
      user: { id: 555, first_name: 'T' },
      authKind: 'telegram',
    });
    let body;
    const res = {
      json(data) {
        body = data;
      },
      setHeader() {},
      status() {
        return this;
      },
    };
    await handler(
      {
        method: 'GET',
        headers: { cookie: `vm_session=${encodeURIComponent(token)}` },
        query: { startapp: 'ref_999' },
      },
      res,
    );
    assert.equal(body.startParam, 'ref_999');
    assert.equal(body.isGuest, false);
  });
});

describe('referral E2E flow', () => {
  const mem = new Map();
  let prevSecret;
  let referralService;

  function defaultRecord() {
    return {
      plan: 'free',
      dailyCount: 0,
      referrerId: null,
      referralCount: 0,
      bonusGenerations: 0,
      totalReferralReward: 0,
      referralMilestone5: false,
      referralMilestone10: false,
      referralConfirmed: false,
      unseenReferralRewards: [],
    };
  }

  function loadReferralServiceWithMockStore() {
    delete require.cache[require.resolve('../lib/referralService')];
    delete require.cache[require.resolve('../lib/kvUserStore')];
    const kvUserStore = require('../lib/kvUserStore');
    kvUserStore.getUserRecord = async (id) => {
      const rec = mem.get(String(id));
      return rec ? { ...rec } : defaultRecord();
    };
    kvUserStore.saveUserRecord = async (id, rec) => {
      mem.set(String(id), { ...rec });
    };
    return require('../lib/referralService');
  }

  beforeEach(() => {
    mem.clear();
    prevSecret = process.env.SESSION_SECRET;
    process.env.SESSION_SECRET = 'referral-e2e-secret';
    referralService = loadReferralServiceWithMockStore();
  });

  afterEach(() => {
    delete require.cache[require.resolve('../lib/referralService')];
    delete require.cache[require.resolve('../lib/kvUserStore')];
    if (prevSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = prevSecret;
  });

  it('binds referrer on first visit and rewards after first generation', async () => {
    const bind = await referralService.bindReferrerOnFirstVisit('web_guest1', 'ref_111');
    assert.equal(bind.bound, true);
    assert.equal(bind.referrerId, '111');

    const guestRec = mem.get('web_guest1');
    assert.equal(guestRec.referrerId, '111');
    assert.equal(guestRec.referralConfirmed, false);

    const confirm = await referralService.confirmReferralAfterFirstGeneration('web_guest1');
    assert.equal(confirm.confirmed, true);
    assert.equal(confirm.referrerId, '111');

    const referrerRec = mem.get('111');
    assert.equal(referrerRec.referralCount, 1);
    assert.equal(referrerRec.bonusGenerations, 10);

    const guestAfter = mem.get('web_guest1');
    assert.equal(guestAfter.referralConfirmed, true);

    const again = await referralService.confirmReferralAfterFirstGeneration('web_guest1');
    assert.equal(again.alreadyConfirmed, true);
  });

  it('passes startParam from guest web session to auth', () => {
    const { resolveAppUser } = require('../lib/miniAppAuth');
    const { signSession } = require('../lib/webSession');
    const token = signSession({
      userId: 'web_abc',
      user: { id: 'web_abc', is_guest: true },
      authKind: 'guest',
      startParam: 'ref_999',
    });
    const res = { headersSent: false, status() { return this; }, json() {} };
    const auth = resolveAppUser(
      { headers: { cookie: `vm_session=${encodeURIComponent(token)}` } },
      res,
    );
    assert.equal(auth.userId, 'web_abc');
    assert.equal(auth.startParam, 'ref_999');
    assert.equal(auth.authKind, 'guest');
  });

  it('buildReferralLink web URL uses /app/ path', () => {
    const links = referralService.buildReferralLink('42', {
      webAppUrl: 'https://app.innoko.ru/app/',
    });
    assert.equal(
      links.webLink,
      'https://app.innoko.ru/app/?startapp=ref_42',
    );
  });

  it('buildReferralLink requires login for guest web_* ids', () => {
    const links = referralService.buildReferralLink('web_abc-123');
    assert.equal(links.requiresLogin, true);
    assert.equal(links.telegramLink, null);
    assert.equal(links.webLink, null);
  });
});

describe('user readReferralParam', () => {
  it('reads startapp from query when auth has no startParam', () => {
    const { readReferralParam } = require('../api/user');
    const req = { query: { startapp: 'ref_12345' } };
    assert.equal(readReferralParam(req, null), 'ref_12345');
    assert.equal(readReferralParam(req, 'ref_99'), 'ref_99');
    assert.equal(readReferralParam({ query: { startapp: 'bad' } }, null), null);
  });
});
