module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    if (!process.env.TELEGRAM_BOT_TOKEN) {
      return res.status(500).json({ error: 'TELEGRAM_BOT_TOKEN is not configured.' });
    }
    const { Bot } = require('grammy');
    const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);
    const { content, channelUsername } = req.body;
    await bot.api.sendMessage(channelUsername, content);
    res.json({ ok: true });
  } catch(e) {
    res.status(500).json({ error: 'Не удалось опубликовать. Убедись что бот добавлен как администратор канала.' });
  }
};
