const { getWebhookBot } = require('../lib/webhookBot');

module.exports = async (req, res) => {
  if (req.method === 'POST') {
    const updateId = req.body?.update_id;
    try {
      if (!process.env.TELEGRAM_BOT_TOKEN) {
        res.status(200).end();
        return;
      }
      const webAppUrl = process.env.WEBAPP_URL || 'https://viral-maker-ai.vercel.app';
      const bot = await getWebhookBot({ token: process.env.TELEGRAM_BOT_TOKEN, webAppUrl });
      await bot.handleUpdate(req.body);
      res.status(200).json({ ok: true });
    } catch (e) {
      console.error('Webhook error:', e.message, updateId ? `update_id=${updateId}` : '');
      res.status(200).json({ ok: false });
    }
  } else {
    res.status(200).json({ ok: true });
  }
};
