const { kv } = require('@vercel/kv');

const PREFIX = 'vm:user:';

function isKvConfigured() {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

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
  };
}

async function getUserRecord(userId) {
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
  };
}

async function saveUserRecord(userId, rec) {
  await kv.set(PREFIX + userId, rec);
}

/** Если в KV записан pro/premium без валидного planUntil — считаем free и сохраняем. */
async function expirePlanIfNeeded(userId, rec) {
  if (!paidTier(rec.plan)) return rec;
  if (isPaidTierActive(rec)) return rec;
  const next = { ...rec, plan: 'free', planUntil: null };
  await saveUserRecord(userId, next);
  return next;
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
  const limit = isPaidTierActive(rec) ? Infinity : 5;
  return { rec, limit };
}

async function incrementGenerationCount(userId, rec) {
  const next = { ...rec, dailyCount: rec.dailyCount + 1, lastReset: rec.lastReset };
  await saveUserRecord(userId, next);
  const limit = isPaidTierActive(next) ? Infinity : 5;
  const remainingToday = limit === Infinity ? undefined : Math.max(0, limit - next.dailyCount);
  return { record: next, remainingToday };
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
    await saveUserRecord(userId, { ...rec, plan: 'free', planUntil: null, dailyCount: 0 });
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
  getQuotaState,
  incrementGenerationCount,
  setUserPlan,
  isPaidTierActive,
  planDurationDays,
};
