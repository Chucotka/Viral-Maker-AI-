const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { mapClientSafeError } = require('../lib/apiErrorMap');
const { sendMappedError } = require('../lib/httpErrors');

describe('apiErrorMap', () => {
  it('maps invalid API key', () => {
    const m = mapClientSafeError(new Error('API key not valid. Please pass a valid API key.'));
    assert.equal(m.code, 'gemini_api_key');
    assert.match(m.message, /GEMINI_API_KEY/);
  });

  it('maps region block', () => {
    const m = mapClientSafeError(new Error('User location is not supported for the API use.'));
    assert.equal(m.code, 'gemini_region');
  });

  it('maps empty model response', () => {
    const err = new Error('Пустой ответ модели. Попробуйте другой промпт.');
    err.status = 502;
    const m = mapClientSafeError(err);
    assert.equal(m.code, 'gemini_empty');
  });

  it('returns null for unknown internal errors', () => {
    assert.equal(mapClientSafeError(new Error('secret internal stack trace xyz')), null);
  });
});

describe('sendMappedError', () => {
  it('exposes gemini message to client', () => {
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
    sendMappedError(res, new Error('API key not valid'), 'test');
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.error, 'gemini_api_key');
    assert.match(res.body.message, /GEMINI_API_KEY/);
  });
});
