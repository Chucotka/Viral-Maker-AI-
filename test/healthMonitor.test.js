const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { buildHealthStatus, listHealthIssues, formatHealthAlertMessage } = require('../lib/healthStatus');

describe('healthStatus', () => {
  it('buildHealthStatus marks ok when core env present', () => {
    const checks = buildHealthStatus({
      GEMINI_API_KEY: 'x',
      TELEGRAM_BOT_TOKEN: '1:abc',
      UPSTASH_REDIS_REST_URL: 'https://x',
      UPSTASH_REDIS_REST_TOKEN: 't',
      SESSION_SECRET: 's',
    });
    assert.equal(checks.ok, true);
    assert.equal(checks.gemini, true);
    assert.equal(checks.bot, true);
  });

  it('listHealthIssues flags missing redis', () => {
    const checks = buildHealthStatus({});
    assert.ok(listHealthIssues(checks).includes('redis'));
    assert.match(formatHealthAlertMessage(checks), /Redis/);
  });
});

describe('healthAlert evaluateAndAlert', () => {
  let statePath;

  beforeEach(() => {
    statePath = path.join(os.tmpdir(), `vm-health-${Date.now()}-${Math.random()}.json`);
  });

  afterEach(() => {
    try {
      fs.unlinkSync(statePath);
    } catch {
      /* ignore */
    }
  });

  it('alerts on transition ok → fail → recovered', async () => {
    const { evaluateAndAlert } = require('../lib/healthAlert');
    const sent = [];
    const send = async (text) => {
      sent.push(text);
    };

    const bad = buildHealthStatus({});
    const first = await evaluateAndAlert({ checks: bad, statePath, send });
    assert.equal(first.notified, true);
    assert.equal(sent.length, 1);

    const second = await evaluateAndAlert({ checks: bad, statePath, send });
    assert.equal(second.notified, false);

    const good = buildHealthStatus({
      GEMINI_API_KEY: 'x',
      TELEGRAM_BOT_TOKEN: '1:abc',
      UPSTASH_REDIS_REST_URL: 'https://x',
      UPSTASH_REDIS_REST_TOKEN: 't',
      SESSION_SECRET: 's',
    });
    const recovered = await evaluateAndAlert({ checks: good, statePath, send });
    assert.equal(recovered.notified, true);
    assert.equal(recovered.recovered, true);
    assert.equal(sent.length, 2);
  });
});
