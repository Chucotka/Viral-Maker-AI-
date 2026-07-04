#!/usr/bin/env node
/**
 * Мониторинг /api/health → алерт владельцам в Telegram.
 * Cron на VPS: */5 * * * * cd /var/www/viral-maker && node scripts/health-monitor.js
 */
require('dotenv').config();

const { buildHealthStatus, formatHealthAlertMessage } = require('../lib/healthStatus');
const { resolveWebAuthOrigin } = require('../lib/webOrigin');
const { evaluateAndAlert } = require('../lib/healthAlert');

async function fetchRemoteHealth(baseUrl) {
  const url = `${String(baseUrl).replace(/\/$/, '')}/api/health`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  const data = await res.json().catch(() => ({}));
  return { url, status: res.status, checks: data };
}

async function main() {
  const externalOrigin = String(
    process.env.HEALTH_CHECK_URL || resolveWebAuthOrigin() || process.env.WEBAPP_URL || '',
  ).trim();
  let checks = buildHealthStatus();
  let sourceUrl = 'local-env';

  if (externalOrigin) {
    try {
      const remote = await fetchRemoteHealth(externalOrigin);
      if (remote.checks && typeof remote.checks === 'object') {
        checks = { ...remote.checks, ts: new Date().toISOString() };
        sourceUrl = remote.url;
      }
    } catch (e) {
      checks = {
        ...buildHealthStatus(),
        ok: false,
        ts: new Date().toISOString(),
        fetch_error: e.message,
      };
      sourceUrl = `${String(externalOrigin).replace(/\/$/, '')}/api/health`;
    }
  }

  const result = await evaluateAndAlert({ checks, url: sourceUrl });
  if (result.notified) {
    console.log(result.recovered ? 'Recovery notice sent' : 'Alert sent', checks);
  } else {
    console.log('No alert needed', { ok: checks.ok });
  }
  process.exit(checks.ok ? 0 : 1);
}

main().catch((e) => {
  console.error('health-monitor failed:', e.message);
  process.exit(2);
});
