#!/usr/bin/env node
/**
 * Проверка GEMINI_API_KEY и моделей генерации изображений на VPS.
 * Использование: node scripts/gemini-image-smoke.js
 */
require('dotenv').config({ quiet: true });

const { configureGeminiNetwork } = require('../lib/geminiNetwork');
configureGeminiNetwork();

const { generateGeminiImage, IMAGE_MODEL_CHAIN } = require('../lib/geminiImageRest');

function fail(msg) {
  console.error('FAIL:', msg);
  process.exit(1);
}

function ok(msg) {
  console.log('OK:', msg);
}

async function main() {
  const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) fail('пустой GEMINI_API_KEY в .env');

  console.log('INFO: модели', IMAGE_MODEL_CHAIN.join(' → '));

  const started = Date.now();
  try {
    const { mimeType, dataBase64, modelUsed } = await generateGeminiImage({
      apiKey,
      prompt: 'Simple flat icon: red circle on white background, minimal, no text.',
      aspectRatio: '1:1',
    });
    const kb = Math.round((dataBase64?.length || 0) * 0.75 / 1024);
    ok(`изображение ${mimeType}, ~${kb} KB, модель ${modelUsed}, ${Date.now() - started} ms`);
  } catch (e) {
    fail(`${e.message} (status ${e.status || 'n/a'})`);
  }
}

main().catch((e) => fail(e.message));
