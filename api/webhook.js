const { getWebhookBot } = require('../lib/webhookBot');

const { resolveWebAppUrl } = require('../lib/webOrigin');

module.exports = async (req, res) => {
  if (req.method === 'POST') {
    const updateId = req.body?.update_id;
    try {
      if (!process.env.TELEGRAM_BOT_TOKEN) {
        res.status(200).end();
        return;
      }
      const webAppUrl = resolveWebAppUrl();
      const bot = await getWebhookBot({ token: process.env.TELEGRAM_BOT_TOKEN, webAppUrl });
      await bot.handleUpdate(req.body);
      res.status(200).json({ ok: true });
    } catch (e) {
      console.error('Webhook error:', e.message, updateId ? `update_id=${updateId}` : '');
      res.status(200).json({ ok: false, error: 'webhook_handler_failed' });
    }
  } else {
    res.status(200).json({ ok: true });
  }
};
