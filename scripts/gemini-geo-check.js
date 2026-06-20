#!/usr/bin/env node
/** Проверка доступности Gemini API с текущего сервера. */
require('dotenv').config({ quiet: true });
const { configureGeminiNetwork } = require('../lib/geminiNetwork');
configureGeminiNetwork();

const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
if (!apiKey) {
  console.error('FAIL: пустой GEMINI_API_KEY');
  process.exit(1);
}

const { getGeminiApiBase, buildGeminiHeaders } = require('../lib/geminiNetwork');

async function main() {
  const url = `${getGeminiApiBase()}/v1beta/models/gemini-2.5-flash:generateContent`;
  const res = await fetch(url, {
    method: 'POST',
    headers: buildGeminiHeaders(apiKey),
    body: JSON.stringify({ contents: [{ parts: [{ text: 'ping' }] }] }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || res.statusText;
    console.error(`FAIL: HTTP ${res.status} — ${msg}`);
    if (/location is not supported/i.test(msg)) {
      console.error('');
      console.error('Причина: Google блокирует IP этого сервера (часто у VPS Timeweb/Hetzner).');
      console.error('Решения:');
      console.error('  1) Включить биллинг в Google AI Studio');
      console.error('  2) GEMINI_HTTPS_PROXY=http://... (прокси в поддерживаемом регионе)');
      console.error('  3) Cloudflare Worker relay — scripts/cloudflare-gemini-relay/README.md');
    }
    process.exit(1);
  }
  console.log('OK: Gemini API доступен с этого сервера');
}

main().catch((e) => {
  console.error('FAIL:', e.message);
  process.exit(1);
});
