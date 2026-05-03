const { Bot } = require('grammy');

module.exports = async (req, res) => {
  if (req.method === 'POST') {
    // Always respond 200 immediately so Telegram doesn't retry
    res.status(200).end();
    try {
      if (!process.env.TELEGRAM_BOT_TOKEN) {
        console.error('Missing TELEGRAM_BOT_TOKEN');
        return;
      }

      const webAppUrl = process.env.WEBAPP_URL || 'https://viral-maker-ai.vercel.app';

      // Fetch real botInfo to avoid errors with hardcoded id
      const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);

      bot.command('start', async (ctx) => {
        await ctx.reply('🚀 Добро пожаловать в Viral Maker AI!\nГотов создавать вирусный контент?', {
          reply_markup: {
            inline_keyboard: [[{ text: '🚀 Открыть Viral Maker AI', web_app: { url: webAppUrl } }]]
          }
        });
      });

      bot.command('generate', async (ctx) => {
        await ctx.reply('Нажми кнопку ниже, чтобы открыть студию контента.', {
          reply_markup: {
            inline_keyboard: [[{ text: '✍️ Создать контент', web_app: { url: webAppUrl } }]]
          }
        });
      });

      bot.command('help', async (ctx) => {
        await ctx.reply(
          '📖 Команды бота:\n\n' +
          '/start — Открыть приложение\n' +
          '/generate — Перейти в студию контента\n' +
          '/help — Показать эту справку'
        );
      });

      await bot.handleUpdate(req.body);
    } catch (e) {
      console.error('Webhook error:', e.message);
    }
  } else {
    res.status(200).json({ ok: true, message: 'webhook is alive' });
  }
};
