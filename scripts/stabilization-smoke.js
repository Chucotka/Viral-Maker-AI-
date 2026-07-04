#!/usr/bin/env node
/**
 * Smoke-check «работает без VPN»: API, веб-сессия, статика, прокси Telegram CDN.
 * Exit 0 — критичные проверки пройдены.
 *
 * Локально на VPS:  node scripts/stabilization-smoke.js --local
 * Снаружи:         node scripts/stabilization-smoke.js
 */
require('dotenv').config({ quiet: true });

const http = require('http');
const https = require('https');

const args = process.argv.slice(2);
const localMode = args.includes('--local');
const port = Number(process.env.PORT || 3001);
const basePublic = String(process.env.WEBAPP_URL || 'https://app.innoko.ru').replace(/\/$/, '');
const base = localMode ? `http://127.0.0.1:${port}` : basePublic;

const results = [];
const LATENCY_WARN_MS = 4000;

function pass(name, detail = '') {
  results.push({ ok: true, name, detail });
}

function fail(name, detail = '') {
  results.push({ ok: false, name, detail });
}

function warn(name, detail = '') {
  results.push({ ok: true, name, detail, warn: true });
}

function request(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const body = opts.body ? JSON.stringify(opts.body) : null;
    const reqOpts = {
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search,
      method: opts.method || 'GET',
      headers: {
        ...(opts.headers || {}),
        ...(body
          ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
          : {}),
      },
      timeout: opts.timeout || 20000,
    };
    const req = lib.request(reqOpts, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let json = {};
        try {
          json = JSON.parse(raw || '{}');
        } catch {
          json = { _raw: raw.slice(0, 500) };
        }
        resolve({
          status: res.statusCode,
          headers: res.headers,
          json,
          raw,
          ms: Date.now() - started,
        });
      });
    });
    req.on('timeout', () => req.destroy(new Error(`timeout ${url}`)));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function noteLatency(name, ms) {
  if (ms > LATENCY_WARN_MS) warn(`${name} latency`, `${ms} ms (> ${LATENCY_WARN_MS})`);
}

async function checkPing() {
  const r = await request(`${base}/api/ping`);
  noteLatency('ping', r.ms);
  if (r.status === 200 && String(r.raw).includes('pong')) pass('GET /api/ping', `${r.ms} ms`);
  else fail('GET /api/ping', `HTTP ${r.status}`);
}

async function checkHealth() {
  const r = await request(`${base}/api/health`);
  noteLatency('health', r.ms);
  const c = r.json || {};
  if (r.status !== 200 && r.status !== 503) {
    fail('GET /api/health', `HTTP ${r.status}`);
    return;
  }
  const issues = [];
  if (!c.redis) issues.push('redis');
  if (!c.gemini) issues.push('gemini');
  if (!c.bot) issues.push('bot');
  if (!c.session) issues.push('session');
  if (issues.length) fail('GET /api/health', `missing: ${issues.join(', ')}`);
  else pass('GET /api/health', `${r.ms} ms · ok=${c.ok}`);
  if (!c.gemini_proxy) warn('Gemini proxy', 'GEMINI_HTTPS_PROXY не задан — генерация может падать из РФ');
}

async function checkTrends() {
  const r = await request(`${base}/api/trends`);
  noteLatency('trends', r.ms);
  const trends = r.json?.trends;
  if (r.status === 200 && Array.isArray(trends) && trends.length > 0) {
    pass('GET /api/trends', `${trends.length} items · ${r.ms} ms`);
  } else fail('GET /api/trends', `HTTP ${r.status}`);
}

async function checkGuestSession() {
  const r = await request(`${base}/api/auth/session`);
  noteLatency('auth/session', r.ms);
  if (r.status !== 200) {
    fail('GET /api/auth/session', `HTTP ${r.status} ${r.json?.error || ''}`);
    return;
  }
  if (r.json?.isGuest && r.json?.userId) {
    pass('Guest session', `${r.json.userId.slice(0, 12)}… · ${r.ms} ms`);
  } else if (r.json?.authenticated) {
    pass('Auth session', `authenticated · ${r.ms} ms`);
  } else fail('GET /api/auth/session', 'unexpected payload');
  const setCookie = r.headers['set-cookie'];
  if (Array.isArray(setCookie) && setCookie.some((c) => /vm_session/i.test(c))) {
    pass('Session cookie', 'Set-Cookie vm_session');
  } else if (r.json?.isGuest) {
    warn('Session cookie', 'cookie not in response (may already exist)');
  }
}

async function checkAppHtml() {
  const r = await request(`${base}/app/`);
  noteLatency('app html', r.ms);
  if (r.status !== 200) {
    fail('GET /app/', `HTTP ${r.status}`);
    return;
  }
  const html = r.raw || '';
  if (html.includes('telegram-web-app.js')) pass('App HTML', 'telegram SDK hook present');
  else fail('App HTML', 'missing scripts');
  if (/src="https:\/\/telegram\.org\/js\/telegram-web-app\.js"/.test(html)) {
    fail('No direct telegram.org SDK', 'still loads external CDN — slow without VPN');
  } else pass('No direct telegram.org SDK', 'browser uses stub / tg-cdn');
  if (html.includes('vm-runtime.js')) pass('App bundles', 'vm-runtime.js linked');
  else fail('App bundles', 'vm-runtime.js missing');
}

async function checkTgCdnProxy() {
  if (localMode) {
    warn('tg-cdn proxy', 'skipped in --local mode (needs nginx)');
    return;
  }
  const r = await request(`${base}/tg-cdn/js/telegram-web-app.js`);
  noteLatency('tg-cdn', r.ms);
  if (r.status === 200 && r.raw.includes('Telegram')) {
    pass('GET /tg-cdn/js/telegram-web-app.js', `${r.ms} ms`);
  } else fail('GET /tg-cdn/js/telegram-web-app.js', `HTTP ${r.status}`);
}

async function main() {
  console.log(`\n=== Stabilization smoke ===`);
  console.log(`Base: ${base}${localMode ? ' (local)' : ''}\n`);

  const steps = [
    checkPing,
    checkHealth,
    checkTrends,
    checkGuestSession,
    checkAppHtml,
    checkTgCdnProxy,
  ];

  for (const step of steps) {
    try {
      await step();
    } catch (e) {
      fail(step.name || 'step', e.message);
    }
  }

  const failed = results.filter((r) => !r.ok);
  const warnings = results.filter((r) => r.warn);

  for (const r of results) {
    const icon = !r.ok ? 'FAIL' : r.warn ? 'WARN' : ' OK ';
    console.log(`[${icon}] ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
  }

  console.log('');
  if (failed.length) {
    console.log(`Итог: ${failed.length} ошибок, ${warnings.length} предупреждений`);
    process.exit(1);
  }
  console.log(`Итог: все ${results.length - warnings.length} проверок пройдены` +
    (warnings.length ? `, ${warnings.length} предупреждений` : ''));
  console.log('\nРучной чеклист в браузере (без VPN):');
  console.log('  1. https://app.innoko.ru/app/ — интерфейс за 2–3 с');
  console.log('  2. «Продолжить как гость» → Studio → генерация текста');
  console.log('  3. «Войти через Telegram в браузере» → admin (если владелец)');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
