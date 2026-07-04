const https = require('https');
const { resolveTelegramUser } = require('../lib/miniAppAuth');
const { getTributePlanConfig } = require('../lib/tributeConfig');
const { sendSafeError } = require('../lib/httpErrors');

async function handleTributeLink(req, res) {
  const plan = String(req.query?.plan || '').toLowerCase();
  const config = getTributePlanConfig(plan);
  if (!config) {
    return res.status(400).json({ error: 'invalid_plan' });
  }
  if (!config.webLink && !config.telegramLink) {
    return res.status(503).json({
      error: 'tribute_not_configured',
      message: 'Добавьте TRIBUTE_PRO_WEBLINK / TRIBUTE_PREMIUM_WEBLINK в .env на сервере.',
    });
  }
  const preferTelegram = String(req.query?.channel || '').toLowerCase() === 'telegram';
  const link =
    preferTelegram && config.telegramLink ? config.telegramLink : config.webLink || config.telegramLink;
  return res.json({
    plan: config.plan,
    link,
    webLink: config.webLink,
    telegramLink: config.telegramLink,
    productId: config.productId,
  });
}

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    try {
      return await handleTributeLink(req, res);
    } catch (e) {
      return sendSafeError(res, e, 'create-invoice-tribute-link');
    }
  }

  if (req.method !== 'POST') return res.status(405).end();

  try {
    const auth = resolveTelegramUser(req, res);
    if (!auth) return;

    const { plan } = req.body;
    const token = process.env.TELEGRAM_BOT_TOKEN;

    if (!plan) return res.status(400).json({ error: 'Missing plan' });
    if (!token) return res.status(500).json({ error: 'Missing bot token' });

    const userId = auth.userId;

    let title, description, price;
    if (plan === 'pro') {
      title = 'Viral Maker Pro';
      description = 'Безлимитные генерации + аналитика на 30 дней';
      price = 99;
    } else if (plan === 'premium') {
      title = 'Viral Maker Premium';
      description = 'Публикация картинок в канал + увеличенный лимит генераций на 30 дней';
      price = 299;
    } else {
      return res.status(400).json({ error: 'Invalid plan' });
    }

    const postData = JSON.stringify({
      title,
      description,
      payload: `plan_${plan}_${userId}`,
      provider_token: '',
      currency: 'XTR',
      prices: [{ label: title, amount: price }],
    });

    const options = {
      hostname: 'api.telegram.org',
      path: `/bot${token}/createInvoiceLink`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const result = await new Promise((resolve, reject) => {
      const gReq = https.request(options, (gRes) => {
        let data = '';
        gRes.on('data', (chunk) => {
          data += chunk;
        });
        gRes.on('end', () => {
          try {
            resolve(JSON.parse(data || '{}'));
          } catch (err) {
            reject(err);
          }
        });
      });
      gReq.on('error', (e) => reject(e));
      gReq.write(postData);
      gReq.end();
    });

    if (result.ok) {
      res.json({ link: result.result });
    } else {
      console.error('Invoice error:', result);
      res.status(500).json({
        error: 'Failed to create invoice',
        message: result?.description || result?.error || 'Telegram rejected the invoice.',
      });
    }
  } catch (e) {
    sendSafeError(res, e, 'create-invoice');
  }
};
