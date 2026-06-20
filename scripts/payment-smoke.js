#!/usr/bin/env node
/**
 * Автоматический smoke-check платежного контура.
 * Не печатает секреты. Exit 0 — все критичные проверки пройдены.
 */
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const https = require('https');

const BASE = (process.env.WEBAPP_URL || 'https://app.innoko.ru').replace(/\/$/, '');
const results = [];

function pass(name, detail = '') {
  results.push({ ok: true, name, detail });
}
function fail(name, detail = '') {
  results.push({ ok: false, name, detail });
}

function httpsJson(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const body = opts.body ? JSON.stringify(opts.body) : null;
    const reqOpts = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: opts.method || 'GET',
      headers: {
        ...(opts.headers || {}),
        ...(body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } : {}),
      },
    };
    const req = https.request(reqOpts, (res) => {
      let data = '';
      res.on('data', (c) => {
        data += c;
      });
      res.on('end', () => {
        let json = {};
        try {
          json = JSON.parse(data || '{}');
        } catch {
          json = { _raw: data.slice(0, 500) };
        }
        resolve({ status: res.statusCode, json, raw: data });
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function buildInitData(botToken, user) {
  const authDate = Math.floor(Date.now() / 1000);
  const params = new URLSearchParams();
  params.set('user', JSON.stringify(user));
  params.set('auth_date', String(authDate));
  const pairs = [];
  for (const [key, value] of params.entries()) {
    pairs.push([key, value]);
  }
  pairs.sort((a, b) => a[0].localeCompare(b[0]));
  const dataCheckString = pairs.map(([k, v]) => `${k}=${v}`).join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  params.set('hash', hash);
  return params.toString();
}

function tributeSignature(rawBody, apiKey) {
  return crypto.createHmac('sha256', apiKey).update(rawBody).digest('hex');
}

async function main() {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const kvUrl = String(process.env.UPSTASH_REDIS_REST_URL || '').trim();
  const kvTok = String(process.env.UPSTASH_REDIS_REST_TOKEN || '').trim();
  const debugSecret = String(process.env.DEBUG_ADMIN_SECRET || '').trim();
  const tributeKey = String(process.env.TRIBUTE_API_KEY || '').trim();
  const proLink = String(process.env.TRIBUTE_PRO_WEBLINK || '').trim();
  const proPid = String(process.env.TRIBUTE_PRO_PRODUCT_ID || '').trim();

  if (token) pass('env TELEGRAM_BOT_TOKEN');
  else fail('env TELEGRAM_BOT_TOKEN', 'не задан');
  if (kvUrl && kvTok) pass('env Upstash KV');
  else fail('env Upstash KV', 'UPSTASH_REDIS_REST_URL/TOKEN');
  if (debugSecret) pass('env DEBUG_ADMIN_SECRET');
  else fail('env DEBUG_ADMIN_SECRET', 'нет — debug-активацию не проверить');
  if (proLink) pass('env TRIBUTE_PRO_WEBLINK');
  else fail('env TRIBUTE_PRO_WEBLINK');
  if (proPid) pass('env TRIBUTE_PRO_PRODUCT_ID');
  else fail('env TRIBUTE_PRO_PRODUCT_ID');

  // Telegram webhook
  if (token) {
    try {
      const wh = await httpsJson(`https://api.telegram.org/bot${token}/getWebhookInfo`);
      const info = wh.json?.result || {};
      if (wh.json?.ok && info.url) {
        const expected = `${BASE}/api/webhook`;
        if (info.url === expected || info.url.includes('/api/webhook')) {
          pass('telegram webhook url', info.url);
        } else {
          fail('telegram webhook url', `ожидали ${expected}, факт: ${info.url}`);
        }
        if (!info.last_error_message) pass('telegram webhook errors', 'нет last_error');
        else fail('telegram webhook errors', info.last_error_message);
      } else {
        fail('telegram getWebhookInfo', wh.json?.description || 'no url');
      }
    } catch (e) {
      fail('telegram getWebhookInfo', e.message);
    }
  }

  // Public endpoints
  try {
    const w = await httpsJson(`${BASE}/api/webhook`);
    if (w.status === 200 && w.json?.ok) pass('GET /api/webhook');
    else fail('GET /api/webhook', `status ${w.status}`);
  } catch (e) {
    fail('GET /api/webhook', e.message);
  }

  try {
    const t = await httpsJson(`${BASE}/api/tribute-link?plan=pro`);
    if (t.status === 200 && t.json?.link) pass('GET /api/tribute-link?plan=pro');
    else fail('GET /api/tribute-link?plan=pro', `status ${t.status}`);
  } catch (e) {
    fail('GET /api/tribute-link?plan=pro', e.message);
  }

  if (!token) {
    printReport();
    process.exit(1);
  }

  // Authenticated API checks (initData must match OWNER_TELEGRAM_IDS for admin endpoints)
  const ownerRaw = String(process.env.OWNER_TELEGRAM_IDS || '999000001').trim();
  const ownerId = Number(ownerRaw.split(',')[0]) || 999000001;
  const testUser = { id: ownerId, first_name: 'PaymentSmoke', username: 'payment_smoke_bot' };
  if (ownerRaw) pass('env OWNER_TELEGRAM_IDS', String(ownerId));
  else fail('env OWNER_TELEGRAM_IDS', 'нет — admin/debug тесты могут не пройти');
  const initData = buildInitData(token, testUser);
  const authHeaders = { 'X-Telegram-Init-Data': initData };

  // create-invoice (needs valid initData + KV on prod)
  try {
    const inv = await httpsJson(`${BASE}/api/create-invoice`, {
      method: 'POST',
      headers: authHeaders,
      body: { plan: 'pro' },
    });
    if (inv.status === 200 && inv.json?.link) {
      pass('POST /api/create-invoice', 'link ok');
    } else if (inv.status === 503 && inv.json?.error === 'kv_required') {
      fail('POST /api/create-invoice', 'kv_required на проде');
    } else {
      fail('POST /api/create-invoice', `${inv.status} ${inv.json?.message || inv.json?.error || ''}`);
    }
  } catch (e) {
    fail('POST /api/create-invoice', e.message);
  }

  // user profile
  try {
    const u = await httpsJson(`${BASE}/api/user`, { headers: authHeaders });
    if (u.status === 200 && u.json?.userId) {
      pass('GET /api/user', `plan=${u.json.plan}`);
    } else {
      fail('GET /api/user', `${u.status} ${u.json?.error || ''}`);
    }
  } catch (e) {
    fail('GET /api/user', e.message);
  }

  // debug plan activation (simulates post-payment state)
  if (debugSecret) {
    try {
      const d = await httpsJson(`${BASE}/api/debug-plan`, {
        method: 'POST',
        headers: { ...authHeaders, 'X-Debug-Secret': debugSecret },
        body: { plan: 'pro' },
      });
      if (d.status === 200 && d.json?.ok) pass('POST /api/debug-plan pro');
      else fail('POST /api/debug-plan', `${d.status} ${d.json?.error || ''}`);

      const u2 = await httpsJson(`${BASE}/api/user`, { headers: authHeaders });
      if (u2.status === 200 && u2.json?.plan === 'pro' && u2.json?.planUntil) {
        pass('plan persisted after activation', u2.json.planUntil);
      } else {
        fail('plan persisted', `plan=${u2.json?.plan}`);
      }

      await httpsJson(`${BASE}/api/manual-plan`, {
        method: 'POST',
        headers: { ...authHeaders, 'X-Debug-Secret': debugSecret, 'Content-Type': 'application/json' },
        body: { target: String(testUser.id), plan: 'free' },
      });
    } catch (e) {
      fail('debug-plan flow', e.message);
    }
  }

  // Tribute webhook signature roundtrip (local handler logic)
  if (tributeKey && proPid) {
    const payload = {
      name: 'new_digital_product',
      payload: {
        telegram_user_id: String(testUser.id),
        product_id: Number(proPid),
      },
    };
    const raw = JSON.stringify(payload);
    const sig = tributeSignature(Buffer.from(raw), tributeKey);
    try {
      const tw = await httpsJson(`${BASE}/api/tribute-webhook`, {
        method: 'POST',
        headers: { 'trbt-signature': sig, 'Content-Type': 'application/json' },
        body: payload,
      });
      if (tw.status === 200) pass('POST /api/tribute-webhook signed');
      else fail('POST /api/tribute-webhook', `status ${tw.status} ${tw.json?.error || ''}`);

      const u3 = await httpsJson(`${BASE}/api/user`, { headers: authHeaders });
      if (u3.status === 200 && u3.json?.plan === 'pro') {
        pass('tribute webhook activated plan');
      } else {
        fail('tribute webhook activated plan', `plan=${u3.json?.plan}`);
      }
    } catch (e) {
      fail('POST /api/tribute-webhook', e.message);
    }
  } else if (!tributeKey) {
    fail('tribute webhook test', 'нет TRIBUTE_API_KEY');
  }

  printReport();
  const failed = results.filter((r) => !r.ok).length;
  process.exit(failed ? 1 : 0);
}

function printReport() {
  console.log('\n=== Payment smoke report ===\n');
  for (const r of results) {
    const mark = r.ok ? 'OK ' : 'FAIL';
    console.log(`${mark}  ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
  }
  const ok = results.filter((r) => r.ok).length;
  console.log(`\n${ok}/${results.length} passed\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
