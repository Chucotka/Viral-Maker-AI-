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
    assert.match(body.userId, /^web_/);
    assert.match(headers['set-cookie'], /vm_session=/);
  });
});
