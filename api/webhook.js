const { Bot } = require('grammy');

module.exports = async (req, res) => {
  if (req.method === 'POST') {
    try {
      if (!process.env.TELEGRAM_BOT_TOKEN) {
        console.error('Missing TELEGRAM_BOT_TOKEN');
        return res.status(200).end();
      }

      // Initialize with dummy bot info to bypass async getMe() initialization requirement
      const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN, {
          botInfo: {
            id: 1,
            is_bot: true,
            first_name: "Viral Maker AI",
            username: "viral_maker_ai_bot",
            can_join_groups: true,
            can_read_all_group_messages: true,
            supports_inline_queries: false,
          }
      });

      const webAppUrl = process.env.WEBAPP_URL || 'https://example.com';
      bot.command('start', async (ctx) => {
        await ctx.reply('🚀 Добро пожаловать в Viral Maker AI!\nГотов создавать вирусный контент?', {
          reply_markup: { inline_keyboard: [[{ text: '🚀 Открыть Viral Maker AI', web_app: { url: webAppUrl } }]] }
        });
      });
      bot.command('generate', async (ctx) => {
        await ctx.reply('Нажми кнопку ниже, чтобы открыть студию контента.', {
          reply_markup: { inline_keyboard: [[{ text: 'Создать контент', web_app: { url: webAppUrl } }]] }
        });
      });

      await bot.handleUpdate(req.body);
    } catch (e) {
      console.error('Webhook error:', e);
    }
    res.status(200).end();
  } else {
    res.status(200).json({ ok: true, message: 'webhook is alive' });
  }
};
