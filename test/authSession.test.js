const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

describe('auth-session', () => {
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
    await handler({ method: 'GET', headers: {} }, res);
    assert.equal(body.authenticated, true);
    assert.equal(body.isGuest, true);
    assert.equal(body.authKind, 'guest');
    assert.match(body.userId, /^web_/);
    assert.equal(body.user.is_guest, true);
    assert.match(headers['set-cookie'], /vm_session=/);
  });

  it('returns existing session from cookie', async () => {
    const { signSession } = require('../lib/webSession');
    const token = signSession({
      userId: '12345',
      user: { id: 12345, first_name: 'Test' },
      authKind: 'telegram',
    });
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
    await handler({
      method: 'GET',
      headers: { cookie: `vm_session=${encodeURIComponent(token)}` },
    }, res);
    assert.equal(body.userId, '12345');
    assert.equal(body.isGuest, false);
    assert.equal(body.authKind, 'telegram');
  });
});
