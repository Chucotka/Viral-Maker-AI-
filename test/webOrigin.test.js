const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { resolveWebAuthOrigin, resolveWebAppUrl } = require('../lib/webOrigin');

describe('webOrigin', () => {
  let prev;

  beforeEach(() => {
    prev = {
      webapp: process.env.WEBAPP_URL,
      origin: process.env.WEB_AUTH_ORIGIN,
    };
    delete process.env.WEB_AUTH_ORIGIN;
  });

  afterEach(() => {
    process.env.WEBAPP_URL = prev.webapp;
    if (prev.origin) process.env.WEB_AUTH_ORIGIN = prev.origin;
    else delete process.env.WEB_AUTH_ORIGIN;
  });

  it('uses app.innoko.ru for innoko.ru WEBAPP_URL', () => {
    process.env.WEBAPP_URL = 'https://innoko.ru/app';
    assert.equal(resolveWebAuthOrigin(), 'https://app.innoko.ru');
    assert.equal(resolveWebAppUrl(), 'https://app.innoko.ru/app/');
  });

  it('keeps viral-maker.ru/app on same origin', () => {
    process.env.WEBAPP_URL = 'https://viral-maker.ru/app';
    assert.equal(resolveWebAuthOrigin(), 'https://viral-maker.ru');
    assert.equal(resolveWebAppUrl(), 'https://viral-maker.ru/app/');
  });

  it('keeps app.innoko.ru/app path', () => {
    process.env.WEBAPP_URL = 'https://app.innoko.ru/app';
    assert.equal(resolveWebAppUrl(), 'https://app.innoko.ru/app/');
  });
});
