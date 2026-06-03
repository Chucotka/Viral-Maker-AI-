/**
 * Реферальная система Viral Maker AI.
 *
 * Правила:
 * - За каждого приглашённого друга: +10 бонусных генераций пригласившему
 * - 5 друзей: +1 день Pro
 * - 10 друзей: +7 дней Pro
 *
 * Формат deep link: startapp=ref_{telegram_id}
 */

const {
  getUserRecord,
  saveUserRecord,
  isPaidTierActive,
} = require('./kvUserStore');

const REFERRAL_PREFIX = 'ref_';
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
  const webAppUrl = String(opts.webAppUrl || process.env.WEBAPP_URL || 'https://viral-maker-ai.vercel.app').replace(/\/+$/, '');
  const param = `${REFERRAL_PREFIX}${userId}`;
  return {
    param,
    telegramLink: `https://t.me/${botUsername}?startapp=${encodeURIComponent(param)}`,
    webLink: `${webAppUrl}/?startapp=${encodeURIComponent(param)}`,
  };
}

/** Продлевает Pro на N дней (или активирует Pro, если пользователь на Free). */
function extendProDays(rec, days) {
  const addMs = days * 864e5;
  const now = Date.now();
  const currentEnd = rec.planUntil ? new Date(rec.planUntil).getTime() : NaN;
  const activePaid = isPaidTierActive(rec);
  const base = activePaid && Number.isFinite(currentEnd) && currentEnd > now ? currentEnd : now;
  return {
    ...rec,
    plan: 'pro',
    planUntil: new Date(base + addMs).toISOString(),
  };
}

/**
 * Начисляет награды рефереру и возвращает информацию о milestone (если достигнут).
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
    rec = extendProDays(rec, PRO_DAYS_M5);
    const reward = { kind: 'milestone', milestone: MILESTONE_5, proDays: PRO_DAYS_M5, bonusGenerations: BONUS_PER_REFERRAL };
    milestones.push(reward);
    unseen.push(reward);
  }

  if (rec.referralCount >= MILESTONE_10 && !rec.referralMilestone10) {
    rec.referralMilestone10 = true;
    rec = extendProDays(rec, PRO_DAYS_M10);
    const reward = { kind: 'milestone', milestone: MILESTONE_10, proDays: PRO_DAYS_M10, bonusGenerations: BONUS_PER_REFERRAL };
    milestones.push(reward);
    unseen.push(reward);
  }

  rec.unseenReferralRewards = unseen;
  await saveUserRecord(referrerId, rec);
  return { referrerRec: rec, milestones };
}

/**
 * Обрабатывает регистрацию по реферальной ссылке (вызывается при GET /api/user).
 * @returns {Promise<{ applied: boolean, referrerId?: string, reason?: string } | null>}
 */
async function processReferralSignup(newUserId, startParam) {
  const referrerId = parseReferrerId(startParam);
  if (!referrerId) return null;

  if (referrerId === String(newUserId)) {
    return { applied: false, reason: 'self_referral' };
  }

  let newUserRec = await getUserRecord(newUserId);
  if (newUserRec.referrerId) {
    return { applied: false, reason: 'already_referred', referrerId: newUserRec.referrerId };
  }

  // Проверяем, что реферер существует (хотя бы раз открывал приложение)
  const referrerRec = await getUserRecord(referrerId);
  const referrerExists =
    Boolean(referrerRec.telegramUsername) ||
    (Number(referrerRec.referralCount) || 0) > 0 ||
    (Number(referrerRec.bonusGenerations) || 0) > 0 ||
    referrerRec.plan !== 'free' ||
    Boolean(referrerRec.referrerId);

  // Разрешаем реферала даже если реферер «пустой» — запись создаётся lazy при первом визите
  void referrerExists;

  newUserRec = { ...newUserRec, referrerId };
  await saveUserRecord(newUserId, newUserRec);
  await rewardReferrer(referrerId);

  return { applied: true, referrerId };
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
    referralMilestone5: Boolean(rec.referralMilestone5),
    referralMilestone10: Boolean(rec.referralMilestone10),
    nextMilestone,
    progressPercent,
    links,
    unseenRewards: Array.isArray(rec.unseenReferralRewards) ? rec.unseenReferralRewards : [],
  };
}

/** Помечает награды как просмотренные (после показа модалки). */
async function ackReferralRewards(userId, milestoneIds = []) {
  const rec = await getUserRecord(userId);
  const unseen = Array.isArray(rec.unseenReferralRewards) ? rec.unseenReferralRewards : [];
  if (!unseen.length) return rec;

  const toClear = new Set(
    (Array.isArray(milestoneIds) ? milestoneIds : [])
      .map((m) => Number(m))
      .filter((m) => Number.isFinite(m) && m > 0),
  );

  const nextUnseen =
    toClear.size > 0
      ? unseen.filter((r) => !toClear.has(Number(r.milestone)))
      : [];

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
  processReferralSignup,
  buildReferralStats,
  ackReferralRewards,
  rewardReferrer,
};
