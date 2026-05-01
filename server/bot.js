let bot;

function setupBot() {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.warn('No TELEGRAM_BOT_TOKEN, bot disabled');
    return null;
  }

  const { Bot } = require('grammy');
  // Initialize with dummy bot info to bypass async init requirement for webhooks
  bot = new Bot(process.env.TELEGRAM_BOT_TOKEN, {
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

  const webAppUrl = process.env.WEBAPP_URL || 'https://example.com'; // fallback if not set

  // Command handlers
  bot.command('start', async (ctx) => {
    await ctx.reply('🚀 Добро пожаловать в Viral Maker AI!\nГотов создавать вирусный контент?', {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🚀 Открыть Viral Maker AI', web_app: { url: webAppUrl } }]
        ]
      }
    });
  });

  bot.command('generate', async (ctx) => {
    await ctx.reply('Нажми кнопку ниже, чтобы открыть студию контента.', {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Создать контент', web_app: { url: webAppUrl } }]
        ]
      }
    });
  });

  bot.catch((err) => console.error('Bot error:', err));
  return bot;
}

function getBot() {
    return bot;
}

module.exports = { setupBot, getBot };
