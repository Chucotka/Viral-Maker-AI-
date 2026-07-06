const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { signSession, verifySession } = require('../lib/webSession');
const { validateTelegramLoginWidget } = require('../lib/telegramLoginWidget');

describe('webSession', () => {
  let prevSecret;

  beforeEach(() => {
    prevSecret = process.env.SESSION_SECRET;
    process.env.SESSION_SECRET = 'test-session-secret';
  });

  afterEach(() => {
    process.env.SESSION_SECRET = prevSecret;
  });

  it('signs and verifies session token', () => {
    const token = signSession({ userId: '42', user: { id: 42, first_name: 'Test' } }, 3600);
    const payload = verifySession(token);
    assert.equal(payload.sub, '42');
    assert.equal(payload.user.first_name, 'Test');
  });

  it('rejects tampered token', () => {
    const token = signSession({ userId: '1', user: { id: 1 } }, 3600);
    const bad = `${token}x`;
    assert.equal(verifySession(bad), null);
  });
});

describe('telegramLoginWidget', () => {
  it('validates widget hash', () => {
    const crypto = require('crypto');
    const botToken = '123456:ABC-DEF';
    const fields = {
      id: 123,
      first_name: 'Mikhail',
      auth_date: Math.floor(Date.now() / 1000),
    };
    const checkString = Object.keys(fields)
      .sort()
      .map((k) => `${k}=${fields[k]}`)
      .join('\n');
    const secretKey = crypto.createHash('sha256').update(botToken).digest();
    const hash = crypto.createHmac('sha256', secretKey).update(checkString).digest('hex');
    const validated = validateTelegramLoginWidget({ ...fields, hash }, botToken);
    assert.ok(validated);
    assert.equal(validated.user.id, 123);
    assert.equal(validated.user.first_name, 'Mikhail');
  });
});
