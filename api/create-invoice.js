const https = require('https');
const { resolveTelegramUser } = require('../lib/miniAppAuth');
const { sendSafeError } = require('../lib/httpErrors');

module.exports = async (req, res) => {
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
