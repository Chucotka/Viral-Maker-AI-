const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

function buildWidgetQuery(botToken) {
  const fields = {
    id: 123,
    first_name: 'Michael',
    auth_date: Math.floor(Date.now() / 1000),
  };
  const checkString = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join('\n');
  const secretKey = crypto.createHash('sha256').update(botToken).digest();
  const hash = crypto.createHmac('sha256', secretKey).update(checkString).digest('hex');
  return { ...fields, hash };
}

describe('auth-telegram-callback', () => {
  let prev;

  beforeEach(() => {
    prev = {
      token: process.env.TELEGRAM_BOT_TOKEN,
      secret: process.env.SESSION_SECRET,
    };
    process.env.TELEGRAM_BOT_TOKEN = '123456:ABC-DEF';
    process.env.SESSION_SECRET = 'test-session-secret';
  });

  afterEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = prev.token;
    process.env.SESSION_SECRET = prev.secret;
  });

  it('redirects to /app/ and sets session cookie on valid query', async () => {
    const handler = require('../api/auth-telegram-callback');
    const query = buildWidgetQuery(process.env.TELEGRAM_BOT_TOKEN);
    const headers = {};
    const res = {
      redirect(code, url) {
        this.statusCode = code;
        this.location = url;
      },
      setHeader(name, value) {
        headers[name.toLowerCase()] = value;
      },
    };
    await handler({ method: 'GET', query }, res);
    assert.equal(res.statusCode, 302);
    assert.equal(res.location, '/app/');
    assert.match(headers['set-cookie'], /vm_session=/);
  });
});
