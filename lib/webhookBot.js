const { Bot } = require('grammy');
const { isKvConfigured, setUserPlan, planDurationDays } = require('./kvUserStore');

let cachedBot = null;
let cachedToken = null;
let cachedWebAppUrl = null;
let cachedInitPromise = null;

function registerWebhookHandlers(bot, webAppUrl) {
  if (bot.__vmWebhookHandlersRegistered) return;
  bot.__vmWebhookHandlersRegistered = true;

  bot.command('start', async (ctx) => {
    await ctx.reply('🚀 Бот работает! Открывай студию:', {
      reply_markup: { inline_keyboard: [[{ text: '🚀 Открыть Студию', web_app: { url: webAppUrl } }]] },
    });
  });

  bot.command('appss_verify', async (ctx) => {
    await ctx.reply('appss_86a5bb');
  });

  bot.on('pre_checkout_query', (ctx) => ctx.answerPreCheckoutQuery(true));

  async function safeReply(ctx, text) {
    try {
      await ctx.reply(text);
    } catch (replyErr) {
      console.error('webhook reply failed:', replyErr.message);
    }
  }

  bot.on('message').filter((ctx) => Boolean(ctx.message?.successful_payment), async (ctx) => {
    if (!isKvConfigured()) {
      console.error('successful_payment: KV not configured');
      await safeReply(ctx, 'Оплата получена, но сервер не сохранил подписку (нет KV). Напишите в поддержку.');
      return;
    }
    const payload = ctx.message.successful_payment?.invoice_payload || '';
    const m = payload.match(/^plan_(pro|premium)_(.+)$/);
    if (!m) {
      console.error('successful_payment: bad payload', payload);
      await safeReply(ctx, 'Ошибка активации счёта. Обратитесь в поддержку.');
      return;
    }
    const [, plan, userId] = m;
    const payerId = ctx.from?.id != null ? String(ctx.from.id) : null;
    if (!payerId || payerId !== String(userId)) {
      console.error('successful_payment: payer mismatch', { payerId, userId, payload });
      await safeReply(ctx, 'Ошибка привязки оплаты к аккаунту. Обратитесь в поддержку.');
      return;
    }
    const subscriptionExpirationDate = ctx.message.successful_payment?.subscription_expiration_date;
    await setUserPlan(userId, plan, {
      subscriptionExpirationDate,
    });
    await safeReply(
      ctx,
      `✨ Подписка ${plan.toUpperCase()} активирована на ${planDurationDays()} дн. Откройте мини-приложение снова.`,
    );
  });
}

/** bot id из токена `123456:secret` — чтобы webhook работал без getMe (важно на serverless). */
function botInfoFromToken(token) {
  const idPart = String(token || '').split(':')[0];
  const id = Number(idPart);
  if (!Number.isFinite(id) || id <= 0) return null;
  return { id, is_bot: true, first_name: 'Viral Maker AI', username: 'viral_maker_ai_bot' };
}

async function getWebhookBot({ token, webAppUrl }) {
  if (!token) throw new Error('Missing TELEGRAM_BOT_TOKEN');
  if (cachedBot && cachedToken === token && cachedWebAppUrl === webAppUrl) return cachedBot;
  if (cachedInitPromise && cachedToken === token && cachedWebAppUrl === webAppUrl) return cachedInitPromise;

  cachedToken = token;
  cachedWebAppUrl = webAppUrl;
  cachedInitPromise = (async () => {
    const botInfo = botInfoFromToken(token);
    const bot = botInfo ? new Bot(token, { botInfo }) : new Bot(token);
    registerWebhookHandlers(bot, webAppUrl);
    if (!botInfo) await bot.init();
    cachedBot = bot;
    return bot;
  })().catch((e) => {
    cachedInitPromise = null;
    cachedBot = null;
    throw e;
  });

  return cachedInitPromise;
}

module.exports = { getWebhookBot };
