const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');

const {
  getAdminAccessStatus,
  adminDenialMessage,
  hasAdminApiAccess,
} = require('../lib/adminAccess');

function mockReq(secret) {
  return {
    headers: secret ? { 'x-debug-secret': secret } : {},
    body: {},
    query: {},
  };
}

describe('adminAccess', () => {
  const prevOwner = process.env.OWNER_TELEGRAM_ID;
  const prevOwners = process.env.OWNER_TELEGRAM_IDS;
  const prevSecret = process.env.DEBUG_ADMIN_SECRET;

  after(() => {
    process.env.OWNER_TELEGRAM_ID = prevOwner;
    process.env.OWNER_TELEGRAM_IDS = prevOwners;
    process.env.DEBUG_ADMIN_SECRET = prevSecret;
  });

  it('denies guest web sessions', () => {
    process.env.OWNER_TELEGRAM_ID = '123';
    process.env.DEBUG_ADMIN_SECRET = 'sekret';
    delete process.env.OWNER_TELEGRAM_IDS;
    const status = getAdminAccessStatus(mockReq('sekret'), 'web_abc');
    assert.equal(status.ok, false);
    assert.equal(status.reason, 'guest_session');
    assert.match(adminDenialMessage(status.reason), /гост/i);
  });

  it('denies non-owner telegram ids', () => {
    process.env.OWNER_TELEGRAM_ID = '123';
    process.env.DEBUG_ADMIN_SECRET = 'sekret';
    delete process.env.OWNER_TELEGRAM_IDS;
    const status = getAdminAccessStatus(mockReq('sekret'), '999');
    assert.equal(status.reason, 'not_owner');
  });

  it('denies owner without secret', () => {
    process.env.OWNER_TELEGRAM_ID = '123';
    process.env.DEBUG_ADMIN_SECRET = 'sekret';
    delete process.env.OWNER_TELEGRAM_IDS;
    const status = getAdminAccessStatus(mockReq(''), '123');
    assert.equal(status.reason, 'secret_missing');
  });

  it('denies owner with wrong secret', () => {
    process.env.OWNER_TELEGRAM_ID = '123';
    process.env.DEBUG_ADMIN_SECRET = 'sekret';
    delete process.env.OWNER_TELEGRAM_IDS;
    const status = getAdminAccessStatus(mockReq('wrong'), '123');
    assert.equal(status.reason, 'secret_mismatch');
  });

  it('allows owner with correct secret', () => {
    process.env.OWNER_TELEGRAM_ID = '123';
    process.env.DEBUG_ADMIN_SECRET = 'sekret';
    delete process.env.OWNER_TELEGRAM_IDS;
    assert.equal(hasAdminApiAccess(mockReq('sekret'), '123'), true);
    assert.equal(getAdminAccessStatus(mockReq('sekret'), '123').ok, true);
  });

  it('denies when DEBUG_ADMIN_SECRET is not configured', () => {
    process.env.OWNER_TELEGRAM_ID = '123';
    process.env.DEBUG_ADMIN_SECRET = '';
    delete process.env.OWNER_TELEGRAM_IDS;
    const status = getAdminAccessStatus(mockReq('anything'), '123');
    assert.equal(status.reason, 'secret_not_configured');
  });
});
