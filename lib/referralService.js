/**
 * Реферальная система Viral Maker AI.
 *
 * Правила:
 * - За каждого подтверждённого реферала: +10 бонусных генераций пригласившему
 * - 5 рефералов: +1 день Pro/Premium (продление активной подписки)
 * - 10 рефералов: +7 дней Pro/Premium
 *
 * Антифрод: referrer_id сохраняется при первом входе, награда — после первой генерации реферала.
 * Формат deep link: startapp=ref_{telegram_id}
 */

const { getRedisClient } = require('./redisClient');
const {
  getUserRecord,
  saveUserRecord,
  isPaidTierActive,
} = require('./kvUserStore');
const { resolveWebAuthOrigin, resolveWebAppUrl } = require('./webOrigin');

const REFERRAL_PREFIX = 'ref_';
const REFERRAL_REWARDED_PREFIX = 'vm:ref:rewarded:';
const BONUS_PER_REFERRAL = 10;
const MILESTONE_5 = 5;
const MILESTONE_10 = 10;
const PRO_DAYS_M5 = 1;
const PRO_DAYS_M10 = 7;

/** Парсит start_param / startapp вида ref_123456789 → telegram id или null. */
function parseReferrerId(startParam) {
  if (!startParam || typeof startParam !== 'string') return null;
  const trimmed = startParam.trim();
  if (!trimmed.startsWith(REFERRAL_PREFIX)) return null;
  const id = trimmed.slice(REFERRAL_PREFIX.length);
  if (!/^\d+$/.test(id)) return null;
  return id;
}

/** Строит реферальную ссылку для шаринга. */
function buildReferralLink(userId, opts = {}) {
  const botUsername = String(opts.botUsername || process.env.TELEGRAM_BOT_USERNAME || 'viral_maker_ai_bot').replace(/^@+/, '');
  const appUrl = String(opts.webAppUrl || resolveWebAppUrl()).replace(/\/?$/, '/');
  const param = `${REFERRAL_PREFIX}${userId}`;
  const webJoin = appUrl.includes('?') ? '&' : '?';
  return {
    param,
    telegramLink: `https://t.me/${botUsername}?startapp=${encodeURIComponent(param)}`,
    webLink: `${appUrl}${webJoin}startapp=${encodeURIComponent(param)}`,
  };
}

/**
 * Продлевает активную подписку на N дней.
 * Сохраняет текущий тариф (Pro/Premium), не понижает Premium до Pro.
 */
function extendPaidPlanDays(rec, days) {
  const addMs = days * 864e5;
  const now = Date.now();
  const currentEnd = rec.planUntil ? new Date(rec.planUntil).getTime() : NaN;
  const activePaid = isPaidTierActive(rec);
  const base = activePaid && Number.isFinite(currentEnd) && currentEnd > now ? currentEnd : now;
  const plan = activePaid && (rec.plan === 'pro' || rec.plan === 'premium') ? rec.plan : 'pro';
  return {
    ...rec,
    plan,
    planUntil: new Date(base + addMs).toISOString(),
  };
}

/**
 * Начисляет награды рефереру после подтверждения реферала (первая генерация).
 * @param {string} referrerId
 * @returns {Promise<{ referrerRec: object, milestones: object[] }>}
 */
async function rewardReferrer(referrerId) {
  let rec = await getUserRecord(referrerId);
  rec.referralCount = (Number(rec.referralCount) || 0) + 1;
  rec.bonusGenerations = (Number(rec.bonusGenerations) || 0) + BONUS_PER_REFERRAL;
  rec.totalReferralReward = (Number(rec.totalReferralReward) || 0) + BONUS_PER_REFERRAL;

  const milestones = [];
  const unseen = Array.isArray(rec.unseenReferralRewards) ? [...rec.unseenReferralRewards] : [];

  if (rec.referralCount >= MILESTONE_5 && !rec.referralMilestone5) {
    rec.referralMilestone5 = true;
    rec = extendPaidPlanDays(rec, PRO_DAYS_M5);
    const reward = {
      kind: 'milestone',
      milestone: MILESTONE_5,
      proDays: PRO_DAYS_M5,
      bonusGenerations: BONUS_PER_REFERRAL,
    };
    milestones.push(reward);
    unseen.push(reward);
  }

  if (rec.referralCount >= MILESTONE_10 && !rec.referralMilestone10) {
    rec.referralMilestone10 = true;
    rec = extendPaidPlanDays(rec, PRO_DAYS_M10);
    const reward = {
      kind: 'milestone',
      milestone: MILESTONE_10,
      proDays: PRO_DAYS_M10,
      bonusGenerations: BONUS_PER_REFERRAL,
    };
    milestones.push(reward);
    unseen.push(reward);
  }

  rec.unseenReferralRewards = unseen;
  await saveUserRecord(referrerId, rec);
  return { referrerRec: rec, milestones };
}

/**
 * Шаг 1: при первом входе по реферальной ссылке — только сохранить referrer_id.
 * Награда НЕ начисляется (антифрод).
 * @param {string} newUserId
 * @param {string} startParam — только из подписанного initData
 */
async function bindReferrerOnFirstVisit(newUserId, startParam) {
  const referrerId = parseReferrerId(startParam);
  if (!referrerId) return null;

  if (referrerId === String(newUserId)) {
    return { bound: false, reason: 'self_referral' };
  }

  let newUserRec = await getUserRecord(newUserId);
  if (newUserRec.referrerId) {
    return {
      bound: false,
      reason: 'already_referred',
      referrerId: newUserRec.referrerId,
      referralConfirmed: Boolean(newUserRec.referralConfirmed),
    };
  }

  newUserRec = {
    ...newUserRec,
    referrerId,
    referralConfirmed: false,
  };
  await saveUserRecord(newUserId, newUserRec);

  return { bound: true, referrerId, pendingReward: true };
}

/**
 * Шаг 2: после первой успешной генерации реферала — начислить награду рефереру.
 * Идемпотентно: повторный вызов безопасен (Redis SET NX + referralConfirmed).
 * @param {string} refereeUserId
 */
async function confirmReferralAfterFirstGeneration(refereeUserId) {
  const rec = await getUserRecord(refereeUserId);
  if (!rec.referrerId) return null;
  if (rec.referralConfirmed) return { alreadyConfirmed: true, referrerId: rec.referrerId };

  const redis = getRedisClient();
  const dedupeKey = `${REFERRAL_REWARDED_PREFIX}${refereeUserId}`;

  // Атомарная защита от двойного начисления при параллельных запросах
  if (redis) {
    const acquired = await redis.set(dedupeKey, String(rec.referrerId), { nx: true });
    if (!acquired) return { alreadyConfirmed: true, referrerId: rec.referrerId };
  }

  await saveUserRecord(refereeUserId, { ...rec, referralConfirmed: true });

  const rewardResult = await rewardReferrer(rec.referrerId);

  // Lazy import — избегаем циклической зависимости referralService ↔ referralNotify
  const { notifyReferrerRewards } = require('./referralNotify');
  notifyReferrerRewards(rec.referrerId, rewardResult).catch((e) => {
    console.error('referral notify unhandled:', e.message);
  });

  return {
    confirmed: true,
    referrerId: rec.referrerId,
    reward: rewardResult,
  };
}

/** @deprecated используйте bindReferrerOnFirstVisit + confirmReferralAfterFirstGeneration */
async function processReferralSignup(newUserId, startParam) {
  return bindReferrerOnFirstVisit(newUserId, startParam);
}

/** Статистика и прогресс для UI. */
function buildReferralStats(rec, userId) {
  const count = Number(rec.referralCount) || 0;
  const bonusGenerations = Number(rec.bonusGenerations) || 0;
  const totalReferralReward = Number(rec.totalReferralReward) || 0;
  const links = buildReferralLink(userId);

  const nextMilestone =
    count < MILESTONE_5
      ? { target: MILESTONE_5, remaining: MILESTONE_5 - count, reward: `+${PRO_DAYS_M5} день Pro` }
      : count < MILESTONE_10
        ? { target: MILESTONE_10, remaining: MILESTONE_10 - count, reward: `+${PRO_DAYS_M10} дней Pro` }
        : null;

  const progressPercent = nextMilestone
    ? Math.min(100, Math.round((count / nextMilestone.target) * 100))
    : 100;

  return {
    referralCount: count,
    bonusGenerations,
    totalReferralReward,
    referrerId: rec.referrerId || null,
    referralConfirmed: Boolean(rec.referralConfirmed),
    referralMilestone5: Boolean(rec.referralMilestone5),
    referralMilestone10: Boolean(rec.referralMilestone10),
    nextMilestone,
    progressPercent,
    links,
    unseenRewards: Array.isArray(rec.unseenReferralRewards) ? rec.unseenReferralRewards : [],
  };
}

/** Помечает награды как просмотренные (после показа модалки в Mini App). */
async function ackReferralRewards(userId, milestoneIds = []) {
  const rec = await getUserRecord(userId);
  const unseen = Array.isArray(rec.unseenReferralRewards) ? rec.unseenReferralRewards : [];
  if (!unseen.length) return rec;

  const toClear = new Set(
    (Array.isArray(milestoneIds) ? milestoneIds : [])
      .map((m) => Number(m))
      .filter((m) => Number.isFinite(m) && m > 0),
  );

  const nextUnseen = toClear.size > 0 ? unseen.filter((r) => !toClear.has(Number(r.milestone))) : [];

  const next = { ...rec, unseenReferralRewards: nextUnseen };
  await saveUserRecord(userId, next);
  return next;
}

module.exports = {
  REFERRAL_PREFIX,
  BONUS_PER_REFERRAL,
  MILESTONE_5,
  MILESTONE_10,
  parseReferrerId,
  buildReferralLink,
  bindReferrerOnFirstVisit,
  confirmReferralAfterFirstGeneration,
  processReferralSignup,
  buildReferralStats,
  ackReferralRewards,
  rewardReferrer,
};
