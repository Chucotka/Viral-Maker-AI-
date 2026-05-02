const { Bot } = require('grammy');

module.exports = async (req, res) => {
  if (req.method === 'POST') {
    try {
      const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);
      await bot.handleUpdate(req.body);
    } catch (e) {
      console.error(e);
    }
    res.status(200).end();
  } else {
    res.status(200).json({ ok: true, message: 'webhook is alive' });
  }
};
