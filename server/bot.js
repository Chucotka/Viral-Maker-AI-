const { Bot } = require('grammy');

let bot;

async function setupBot() {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.error('TELEGRAM_BOT_TOKEN is not set. Bot will not start.');
    return;
  }

  bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);

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

  // Start polling
  try {
      bot.catch((err) => console.error('Bot error:', err));
      bot.start().catch(err => console.error('Failed to start polling:', err));
      console.log('Telegram Bot is up and running!');
  } catch (err) {
      console.error('Failed to start Telegram Bot:', err);
  }
}

function getBot() {
    return bot;
}

module.exports = { setupBot, getBot };
