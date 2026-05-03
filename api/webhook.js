const { Bot } = require('grammy');
const fs = require('fs');

module.exports = async (req, res) => {
  if (req.method === 'POST') {
    try {
      if (!process.env.TELEGRAM_BOT_TOKEN) {
        res.status(200).end();
        return;
      }
      const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);
      const webAppUrl = process.env.WEBAPP_URL || 'https://viral-maker-ai.vercel.app';

      // Commands
      bot.command('start', (ctx) => ctx.reply('🚀 Добро пожаловать!', {
        reply_markup: { inline_keyboard: [[{ text: '🚀 Открыть Студию', web_app: { url: webAppUrl } }]] }
      }));

      bot.command('appss_verify', async (ctx) => {
        await ctx.reply('appss_86a5bb');
      });

      // Payment logic
      bot.on('pre_checkout_query', (ctx) => ctx.answerPreCheckoutQuery(true));
      bot.on('message:successful_payment', async (ctx) => {
        const payload = ctx.message.successful_payment.invoice_payload;
        const [_, plan, userId] = payload.split('_');
        const usersPath = '/tmp/users.json';
        let users = {};
        try { if (fs.existsSync(usersPath)) users = JSON.parse(fs.readFileSync(usersPath, 'utf8')); } catch(e) {}
        users[userId] = { ...users[userId], plan: plan, dailyCount: 0 };
        try { fs.writeFileSync(usersPath, JSON.stringify(users)); } catch(e) {}
        await ctx.reply(`✨ Ура! Подписка ${plan.toUpperCase()} активирована.`);
      });

      await bot.handleUpdate(req.body);
      res.status(200).json({ ok: true });
    } catch (e) {
      console.error('Webhook error:', e.message);
      res.status(200).json({ ok: false });
    }
  } else {
    res.status(200).json({ ok: true });
  }
};
