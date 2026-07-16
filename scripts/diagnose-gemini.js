#!/usr/bin/env node
/** Проверка Gemini с VPS: node scripts/diagnose-gemini.js */
require('dotenv').config({ quiet: true, override: true });
const { configureGeminiNetwork } = require('../lib/geminiNetwork');
const { probeGeminiText } = require('../lib/geminiProbe');
const { buildHealthStatus } = require('../lib/healthStatus');

configureGeminiNetwork();

async function main() {
  const health = buildHealthStatus();
  console.log('=== Gemini diagnose ===');
  console.log('build:', health.build_version || '(local)');
  console.log('gemini_key:', health.gemini ? 'set' : 'MISSING');
  console.log('gemini_proxy:', health.gemini_proxy ? 'yes' : 'no (may fail from RU VPS)');
  console.log('redis:', health.redis ? 'ok' : 'MISSING');
  console.log('');

  const probe = await probeGeminiText();
  if (probe.ok) {
    console.log(`OK: model=${probe.model} ${probe.ms}ms sample="${probe.sample}"`);
    process.exit(0);
  }

  console.error('FAIL:', probe.error);
  if (!health.gemini_proxy && /location is not supported|fetch failed|ECONNREFUSED|ETIMEDOUT/i.test(probe.error || '')) {
    console.error('');
    console.error('Подсказка: добавьте в .env GEMINI_HTTPS_PROXY=http://... и перезапустите pm2');
  }
  if (/API key not valid|API_KEY_INVALID|PERMISSION_DENIED/i.test(probe.error || '')) {
    console.error('');
    console.error('Подсказка: обновите GEMINI_API_KEY в .env (Google AI Studio)');
  }
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
