#!/usr/bin/env node
/**
 * Показывает id и webLink товаров Tribute — для TRIBUTE_*_PRODUCT_ID в .env.
 * Нужен TRIBUTE_API_KEY (Creator Dashboard → Settings → API Keys).
 */
const https = require('https');

const apiKey = String(process.env.TRIBUTE_API_KEY || '').trim();
if (!apiKey) {
  console.error('Задайте TRIBUTE_API_KEY в .env или: TRIBUTE_API_KEY=... node scripts/tribute-list-products.js');
  process.exit(1);
}

function getProducts(page = 1) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'tribute.tg',
        path: `/api/v1/products?page=${page}&size=50&type=digital`,
        method: 'GET',
        headers: { 'Api-Key': apiKey },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, json: JSON.parse(data || '{}') });
          } catch (e) {
            reject(e);
          }
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

(async () => {
  const { status, json } = await getProducts();
  if (status !== 200) {
    console.error('Tribute API error', status, json?.message || json?.error || json);
    process.exit(1);
  }
  const rows = json?.rows || [];
  if (!rows.length) {
    console.log('Нет digital-товаров в кабинете Tribute.');
    return;
  }
  console.log('Скопируйте id в TRIBUTE_PRO_PRODUCT_ID / TRIBUTE_PREMIUM_PRODUCT_ID:\n');
  for (const p of rows) {
    console.log(`id=${p.id}  name=${p.name}  webLink=${p.webLink || ''}`);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
