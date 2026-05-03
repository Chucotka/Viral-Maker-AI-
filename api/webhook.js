const { Bot } = require('grammy');
const fs = require('fs');

module.exports = async (req, res) => {
  if (req.method === 'POST') {
    res.status(200).end();
    try {
      if (!process.env.TELEGRAM_BOT_TOKEN) return;
      const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);
      const webAppUrl = process.env.WEBAPP_URL || 'https://viral-maker-ai.vercel.app';

      // Commands
      bot.command('start', (ctx) => ctx.reply('🚀 Добро пожаловать!', {
        reply_markup: { inline_keyboard: [[{ text: '🚀 Открыть Студию', web_app: { url: webAppUrl } }]] }
      }));

      bot.command('appss_verify', (ctx) => ctx.reply('appss_86a5bb'));

      // Payment logic: Stage 1 (Confirm intent)
      bot.on('pre_checkout_query', (ctx) => ctx.answerPreCheckoutQuery(true));

      // Payment logic: Stage 2 (Successful payment)
      bot.on('message:successful_payment', async (ctx) => {
        const payload = ctx.message.successful_payment.invoice_payload;
        // payload format: plan_pro_USERID or plan_premium_USERID
        const [_, plan, userId] = payload.split('_');
        
        console.log(`Payment success: User ${userId} bought ${plan}`);

        // Save to temporary DB (WARNING: ephemeral)
        const usersPath = '/tmp/users.json';
        let users = {};
        try { if (fs.existsSync(usersPath)) users = JSON.parse(fs.readFileSync(usersPath, 'utf8')); } catch(e) {}
        
        users[userId] = { ...users[userId], plan: plan, dailyCount: 0 };
        try { fs.writeFileSync(usersPath, JSON.stringify(users)); } catch(e) {}

        await ctx.reply(`✨ Ура! Подписка ${plan.toUpperCase()} активирована. Перезапусти приложение, чтобы применить изменения.`);
      });

      await bot.handleUpdate(req.body);
    } catch (e) {
      console.error('Webhook error:', e.message);
    }
  } else {
    res.status(200).json({ ok: true });
  }
};
