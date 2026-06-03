/**
 * Telegram-уведомления рефереру о начислении бонусов.
 */

const { Bot } = require('grammy');

const BONUS_PER_REFERRAL = 10;
const MILESTONE_5 = 5;
const MILESTONE_10 = 10;

let cachedBot = null;
let cachedToken = null;

function getNotifyBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;
  if (cachedBot && cachedToken === token) return cachedBot;
  const idPart = String(token).split(':')[0];
  const id = Number(idPart);
  const botInfo =
    Number.isFinite(id) && id > 0
      ? { id, is_bot: true, first_name: 'Viral Maker AI', username: 'viral_maker_ai_bot' }
      : undefined;
  cachedToken = token;
  cachedBot = botInfo ? new Bot(token, { botInfo }) : new Bot(token);
  return cachedBot;
}

function formatPlanUntil(planUntil) {
  if (!planUntil) return '';
  try {
    const d = new Date(planUntil);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return '';
  }
}

function buildBonusMessage(referralCount) {
  return (
    `🎉 <b>Новый реферал подтверждён!</b>\n\n` +
    `Друг сделал первую генерацию — вам начислено <b>+${BONUS_PER_REFERRAL} бонусных генераций</b>.\n` +
    `Всего приглашённых друзей: <b>${referralCount}</b>.`
  );
}

function buildMilestoneMessage(milestone, proDays, planUntil, plan) {
  const until = formatPlanUntil(planUntil);
  const planLabel = plan === 'premium' ? 'Premium' : 'Pro';
  if (milestone >= MILESTONE_10) {
    return (
      `🏆 <b>${MILESTONE_10} друзей — milestone!</b>\n\n` +
      `Вам добавлено <b>+${proDays} дней ${planLabel}</b>` +
      (until ? ` (активно до ${until})` : '') +
      `.`
    );
  }
  return (
    `⚡ <b>${MILESTONE_5} друзей — milestone!</b>\n\n` +
    `Вам добавлено <b>+${proDays} ${proDays === 1 ? 'день' : 'дней'} ${planLabel}</b>` +
    (until ? ` (активно до ${until})` : '') +
    `.`
  );
}

/**
 * @param {string} referrerId — Telegram user id
 * @param {{ referrerRec: object, milestones: object[] }} rewardResult
 */
async function notifyReferrerRewards(referrerId, rewardResult) {
  const bot = getNotifyBot();
  if (!bot || !referrerId || !rewardResult?.referrerRec) return;

  const { referrerRec, milestones = [] } = rewardResult;
  const chatId = Number(referrerId);
  if (!Number.isFinite(chatId)) return;

  try {
    await bot.api.sendMessage(chatId, buildBonusMessage(referrerRec.referralCount), { parse_mode: 'HTML' });

    for (const m of milestones) {
      if (m?.kind !== 'milestone') continue;
      await bot.api.sendMessage(
        chatId,
        buildMilestoneMessage(m.milestone, m.proDays, referrerRec.planUntil, referrerRec.plan),
        { parse_mode: 'HTML' },
      );
    }
  } catch (e) {
    console.error('referral notify failed:', { referrerId, error: e.message });
  }
}

module.exports = { notifyReferrerRewards };
