const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { mapClientSafeError } = require('../lib/apiErrorMap');

describe('apiErrorMap', () => {
  it('maps Gemini geo-block to proxy hint', () => {
    const m = mapClientSafeError(new Error('User location is not supported for the API use.'));
    assert.equal(m.code, 'gemini_region');
    assert.match(m.message, /GEMINI_HTTPS_PROXY/);
  });

  it('maps limit_reached', () => {
    const m = mapClientSafeError(new Error('limit_reached'));
    assert.equal(m.status, 403);
    assert.equal(m.code, 'limit_reached');
  });

  it('returns null for unknown internal errors', () => {
    assert.equal(mapClientSafeError(new Error('secret internal stack trace with token=abc')), null);
  });
});

describe('tributeWebhook signature', () => {
  it('verifies HMAC with raw JSON body', () => {
    const { verifyTributeSignature, readTributeSignature } = require('../lib/tributeWebhook');
    const apiKey = 'test-tribute-key';
    const body = Buffer.from(JSON.stringify({ name: 'new_digital_product', payload: { telegram_user_id: '42' } }));
    const sig = crypto.createHmac('sha256', apiKey).update(body).digest('hex');
    assert.ok(verifyTributeSignature(body, sig, apiKey));
    assert.equal(readTributeSignature({ 'x-trbt-signature': sig }), sig);
  });
});

describe('tribute-webhook handler rawBody', () => {
  it('does not overwrite express rawBody with empty stream read', async () => {
    const handler = require('../api/tribute-webhook');
    const apiKey = 'wh-key-123';
    process.env.TRIBUTE_API_KEY = apiKey;
    const payload = { name: 'new_digital_product', payload: { telegram_user_id: '99', product_id: 121282 } };
    const rawBody = Buffer.from(JSON.stringify(payload));
    const sig = crypto.createHmac('sha256', apiKey).update(rawBody).digest('hex');

    let statusCode;
    let body;
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(data) {
        body = data;
      },
      end() {},
    };

    const req = {
      method: 'POST',
      headers: { 'trbt-signature': sig, 'content-type': 'application/json' },
      rawBody,
      body: payload,
      on() {},
      [Symbol.asyncIterator]() {
        return { next: async () => ({ done: true }) };
      },
    };

    // Without Redis this returns 503 after signature passes — signature must pass first
    await handler(req, res);
    assert.notEqual(statusCode, 401);
    process.env.TRIBUTE_API_KEY = '';
  });
});
