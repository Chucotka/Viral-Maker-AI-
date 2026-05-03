const https = require('https');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  
  try {
    const { userId, plan } = req.body;
    const token = process.env.TELEGRAM_BOT_TOKEN;

    if (!userId || !plan) return res.status(400).json({ error: 'Missing params' });

    let title, description, price;
    if (plan === 'pro') {
      title = 'Viral Maker Pro';
      description = 'Безлимитные генерации + аналитика на 30 дней';
      price = 99;
    } else {
      title = 'Viral Maker Premium';
      description = 'Автопостинг + все платформы на 30 дней';
      price = 299;
    }

    const postData = JSON.stringify({
      title: title,
      description: description,
      payload: `plan_${plan}_${userId}`, // Data to identify the payment later
      provider_token: "", // Empty for Telegram Stars
      currency: "XTR", // XTR = Telegram Stars
      prices: [{ label: title, amount: price }],
    });

    const options = {
      hostname: 'api.telegram.org',
      path: `/bot${token}/createInvoiceLink`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const result = await new Promise((resolve, reject) => {
      const gReq = https.request(options, (gRes) => {
        let data = '';
        gRes.on('data', (chunk) => data += chunk);
        gRes.on('end') ; resolve(JSON.parse(data));
      });
      gReq.on('error', (e) => reject(e));
      gReq.write(postData);
      gReq.end();
    });

    if (result.ok) {
      res.json({ link: result.result });
    } else {
      console.error('Invoice error:', result);
      res.status(500).json({ error: 'Failed to create invoice' });
    }

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
