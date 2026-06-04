const { getRedisClient, isKvConfigured } = require('./redisClient');

function getKv() {
  const redis = getRedisClient();
  if (!redis) {
    throw new Error('Redis is not configured');
  }
  return redis;
}

const PREFIX = 'vm:user:';
const USERNAME_PREFIX = 'vm:username:';

function paidTier(plan) {
  return plan === 'pro' || plan === 'premium' ? plan : null;
}

function planDurationDays() {
  const d = Number(process.env.PLAN_DURATION_DAYS);
  return Number.isFinite(d) && d > 0 ? d : 30;
}

function isPaidTierActive(rec) {
  const tier = paidTier(rec.plan);
  if (!tier) return false;
  if (!rec.planUntil || typeof rec.planUntil !== 'string') return false;
  const until = new Date(rec.planUntil).getTime();
  return Number.isFinite(until) && until > Date.now();
}

function defaultRecord() {
  return {
    plan: 'free',
    dailyCount: 0,
    lastReset: null,
    planUntil: null,
    niche: '',
    language: '',
    styleNote: '',
    brandMemory: '',
    telegramUsername: '',
    // Реферальная система
    referrerId: null,
    referralCount: 0,
    bonusGenerations: 0,
    totalReferralReward: 0,
    referralMilestone5: false,
    referralMilestone10: false,
    referralConfirmed: false,
    unseenReferralRewards: [],
    lastPaidPlan: null,
    lastPaidUntil: null,
  };
}

function normalizeTelegramUsername(username) {
  return String(username || '').trim().replace(/^@+/, '').toLowerCase();
}

async function getUserRecord(userId) {
  const kv = getKv();
  const key = PREFIX + userId;
  const raw = await kv.get(key);
  if (!raw || typeof raw !== 'object') return defaultRecord();
  return {
    plan: raw.plan || 'free',
    dailyCount: Number(raw.dailyCount) || 0,
    lastReset: raw.lastReset || null,
    planUntil: raw.planUntil && typeof raw.planUntil === 'string' ? raw.planUntil : null,
    niche: typeof raw.niche === 'string' ? raw.niche.slice(0, 120) : '',
    language: typeof raw.language === 'string' ? raw.language.slice(0, 40) : '',
    styleNote: typeof raw.styleNote === 'string' ? raw.styleNote.slice(0, 200) : '',
    brandMemory: typeof raw.brandMemory === 'string' ? raw.brandMemory.slice(0, 1000) : '',
    telegramUsername: typeof raw.telegramUsername === 'string' ? raw.telegramUsername.slice(0, 64) : '',
    referrerId: raw.referrerId != null ? String(raw.referrerId) : null,
    referralCount: Number(raw.referralCount) || 0,
    bonusGenerations: Number(raw.bonusGenerations) || 0,
    totalReferralReward: Number(raw.totalReferralReward) || 0,
    referralMilestone5: Boolean(raw.referralMilestone5),
    referralMilestone10: Boolean(raw.referralMilestone10),
    referralConfirmed: Boolean(raw.referralConfirmed),
    unseenReferralRewards: Array.isArray(raw.unseenReferralRewards) ? raw.unseenReferralRewards : [],
    lastPaidPlan: raw.lastPaidPlan === 'pro' || raw.lastPaidPlan === 'premium' ? raw.lastPaidPlan : null,
    lastPaidUntil: raw.lastPaidUntil && typeof raw.lastPaidUntil === 'string' ? raw.lastPaidUntil : null,
  };
}

async function saveUserRecord(userId, rec) {
  const kv = getKv();
  await kv.set(PREFIX + userId, rec);
}

async function clearUserPlan(userId) {
  const rec = await getUserRecord(userId);
  const next = {
    ...rec,
    lastPaidPlan: paidTier(rec.plan) ? rec.plan : rec.lastPaidPlan || null,
    lastPaidUntil: paidTier(rec.plan) && rec.planUntil ? rec.planUntil : rec.lastPaidUntil || null,
    plan: 'free',
    planUntil: null,
    // dailyCount не сбрасываем — иначе при отмене подписки free получит свежие 5 попыток в тот же день
  };
  await saveUserRecord(userId, next);
  return next;
}

async function saveTelegramIdentity(userId, telegramUser) {
  if (!userId || !telegramUser || typeof telegramUser !== 'object') return;
  const username = normalizeTelegramUsername(telegramUser.username);
  if (!username) return;
  const rec = await getUserRecord(userId);
  if (rec.telegramUsername !== username) {
    await saveUserRecord(userId, { ...rec, telegramUsername: username });
  }
  const kv = getKv();
  await kv.set(`${USERNAME_PREFIX}${username}`, String(userId));
}

async function findUserIdByTelegramUsername(username) {
  const normalized = normalizeTelegramUsername(username);
  if (!normalized) return null;
  const kv = getKv();
  const userId = await kv.get(`${USERNAME_PREFIX}${normalized}`);
  return userId ? String(userId) : null;
}

async function listActivePaidUsers(opts = {}) {
  const kv = getKv();
  const limit = Number(opts.limit ?? 100);
  const scanCount = Number(opts.scanCount ?? 100);
  const max = Number.isFinite(limit) && limit > 0 ? limit : 100;
  const count = Number.isFinite(scanCount) && scanCount > 0 ? scanCount : 100;
  const items = [];
  let cursor = '0';

  do {
    const [nextCursor, keys] = await kv.scan(cursor, { match: `${PREFIX}*`, count });
    cursor = String(nextCursor);
    for (const key of Array.isArray(keys) ? keys : []) {
      if (items.length >= max) break;
      const userId = String(key).slice(PREFIX.length);
      if (!userId) continue;
      let rec = await getUserRecord(userId);
      rec = await expirePlanIfNeeded(userId, rec);
      if (!isPaidTierActive(rec)) continue;
      items.push({
        userId,
        plan: rec.plan,
        planUntil: rec.planUntil || null,
        telegramUsername: rec.telegramUsername || '',
        dailyCount: Number(rec.dailyCount) || 0,
      });
    }
  } while (cursor !== '0' && items.length < max);

  items.sort((a, b) => {
    const ta = a.planUntil ? new Date(a.planUntil).getTime() : 0;
    const tb = b.planUntil ? new Date(b.planUntil).getTime() : 0;
    return tb - ta;
  });

  return items;
}

function subscriptionRow(userId, rec, status) {
  return {
    userId,
    status,
    plan: status === 'active' ? rec.plan : rec.lastPaidPlan || rec.plan,
    planUntil: status === 'active' ? rec.planUntil : rec.lastPaidUntil || rec.planUntil,
    telegramUsername: rec.telegramUsername || '',
    referralCount: Number(rec.referralCount) || 0,
    bonusGenerations: Number(rec.bonusGenerations) || 0,
    dailyCount: Number(rec.dailyCount) || 0,
  };
}

/**
 * Обзор подписок для admin: активные, истёкшие, free-пользователи с username.
 */
async function listSubscriptionOverview(opts = {}) {
  const kv = getKv();
  const scanCount = Number(opts.scanCount ?? 100);
  const freeLimit = Number(opts.freeLimit ?? 40);
  const maxScan = Number.isFinite(scanCount) && scanCount > 0 ? scanCount : 100;

  const active = [];
  const expired = [];
  const freeUsers = [];
  let cursor = '0';

  do {
    const [nextCursor, keys] = await kv.scan(cursor, { match: `${PREFIX}*`, count: maxScan });
    cursor = String(nextCursor);
    for (const key of Array.isArray(keys) ? keys : []) {
      const userId = String(key).slice(PREFIX.length);
      if (!userId) continue;
      let rec = await getUserRecord(userId);
      rec = await expirePlanIfNeeded(userId, rec);

      if (isPaidTierActive(rec)) {
        active.push(subscriptionRow(userId, rec, 'active'));
        continue;
      }

      if (rec.lastPaidPlan && (rec.lastPaidPlan === 'pro' || rec.lastPaidPlan === 'premium')) {
        expired.push(subscriptionRow(userId, rec, 'expired'));
        continue;
      }

      if (rec.telegramUsername && rec.plan === 'free' && freeUsers.length < freeLimit) {
        freeUsers.push(subscriptionRow(userId, rec, 'free'));
      }
    }
  } while (cursor !== '0');

  const byUntilDesc = (a, b) => {
    const ta = a.planUntil ? new Date(a.planUntil).getTime() : 0;
    const tb = b.planUntil ? new Date(b.planUntil).getTime() : 0;
    return tb - ta;
  };
  active.sort(byUntilDesc);
  expired.sort(byUntilDesc);
  freeUsers.sort((a, b) => String(a.telegramUsername).localeCompare(String(b.telegramUsername)));

  return {
    active,
    expired,
    freeUsers,
    totals: {
      active: active.length,
      expired: expired.length,
      freeUsers: freeUsers.length,
    },
  };
}

/** Если в KV записан pro/premium без валидного planUntil — считаем free и сохраняем. */
async function expirePlanIfNeeded(userId, rec) {
  if (!paidTier(rec.plan)) return rec;
  if (isPaidTierActive(rec)) return rec;
  const next = {
    ...rec,
    lastPaidPlan: rec.plan,
    lastPaidUntil: rec.planUntil || null,
    plan: 'free',
    planUntil: null,
  };
  await saveUserRecord(userId, next);
  return next;
}

const FREE_DAILY_LIMIT = 5;

/** Эффективная квота с учётом бонусных реферальных генераций. */
function getEffectiveQuota(rec, limit = FREE_DAILY_LIMIT) {
  if (limit === Infinity) {
    return {
      canGenerate: true,
      dailyRemaining: Infinity,
      bonusGenerations: Number(rec.bonusGenerations) || 0,
      totalRemaining: Infinity,
    };
  }
  const dailyRemaining = Math.max(0, limit - (Number(rec.dailyCount) || 0));
  const bonusGenerations = Number(rec.bonusGenerations) || 0;
  return {
    canGenerate: dailyRemaining > 0 || bonusGenerations > 0,
    dailyRemaining,
    bonusGenerations,
    totalRemaining: dailyRemaining + bonusGenerations,
  };
}

/** Сброс дня при необходимости, вернуть актуальное состояние и лимит. */
async function getQuotaState(userId) {
  const today = new Date().toISOString().split('T')[0];
  let rec = await getUserRecord(userId);
  rec = await expirePlanIfNeeded(userId, rec);
  if (rec.lastReset !== today) {
    rec = { ...rec, dailyCount: 0, lastReset: today };
    await saveUserRecord(userId, rec);
  }
  const limit = isPaidTierActive(rec) ? Infinity : FREE_DAILY_LIMIT;
  const quota = getEffectiveQuota(rec, limit);
  return { rec, limit, quota };
}

async function incrementGenerationCount(userId, rec) {
  const limit = isPaidTierActive(rec) ? Infinity : FREE_DAILY_LIMIT;
  let next = { ...rec, lastReset: rec.lastReset };

  if (limit === Infinity) {
    next.dailyCount = (Number(next.dailyCount) || 0) + 1;
  } else if ((Number(next.dailyCount) || 0) < limit) {
    next.dailyCount = (Number(next.dailyCount) || 0) + 1;
  } else if ((Number(next.bonusGenerations) || 0) > 0) {
    next.bonusGenerations = (Number(next.bonusGenerations) || 0) - 1;
  } else {
    throw new Error('limit_reached');
  }

  await saveUserRecord(userId, next);
  const quota = getEffectiveQuota(next, limit);
  const remainingToday = limit === Infinity ? undefined : quota.totalRemaining;
  return { record: next, remainingToday, quota };
}

/**
 * Активация тарифа после оплаты (Telegram Stars).
 * Продление того же тарифа: +durationDays от текущего planUntil, если подписка ещё активна.
 */
async function setUserPlan(userId, plan, opts = {}) {
  const rec = await getUserRecord(userId);
  const tier = paidTier(plan);
  const days = Number(opts.durationDays ?? planDurationDays()) || 30;
  if (!tier) {
    await saveUserRecord(userId, { ...rec, plan: 'free', planUntil: null });
    return;
  }
  const providedUntilRaw = Number(opts.planUntil ?? opts.subscriptionExpirationDate ?? NaN);
  const providedUntilMs =
    Number.isFinite(providedUntilRaw) && providedUntilRaw > 0
      ? providedUntilRaw < 1e12
        ? providedUntilRaw * 1000
        : providedUntilRaw
      : NaN;
  if (Number.isFinite(providedUntilMs) && providedUntilMs > Date.now()) {
    await saveUserRecord(userId, {
      ...rec,
      plan: tier,
      planUntil: new Date(providedUntilMs).toISOString(),
      dailyCount: 0,
    });
    return;
  }
  const now = Date.now();
  const currentEnd = rec.planUntil ? new Date(rec.planUntil).getTime() : NaN;
  const sameTierRenewal =
    paidTier(rec.plan) === tier && Number.isFinite(currentEnd) && currentEnd > now && rec.plan === tier;
  const base = sameTierRenewal ? currentEnd : now;
  const planUntil = new Date(base + days * 864e5).toISOString();
  await saveUserRecord(userId, { ...rec, plan: tier, planUntil, dailyCount: 0 });
}

module.exports = {
  isKvConfigured,
  getUserRecord,
  saveUserRecord,
  clearUserPlan,
  saveTelegramIdentity,
  findUserIdByTelegramUsername,
  listActivePaidUsers,
  listSubscriptionOverview,
  normalizeTelegramUsername,
  getEffectiveQuota,
  getQuotaState,
  incrementGenerationCount,
  setUserPlan,
  isPaidTierActive,
  planDurationDays,
  FREE_DAILY_LIMIT,
};
