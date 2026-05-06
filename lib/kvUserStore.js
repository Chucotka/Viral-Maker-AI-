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
    telegramUsername: '',
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
    telegramUsername: typeof raw.telegramUsername === 'string' ? raw.telegramUsername.slice(0, 64) : '',
  };
}

async function saveUserRecord(userId, rec) {
  const kv = getKv();
  await kv.set(PREFIX + userId, rec);
}

async function clearUserPlan(userId) {
  const rec = await getUserRecord(userId);
  const next = { ...rec, plan: 'free', planUntil: null, dailyCount: 0 };
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
  clearUserPlan,
  saveTelegramIdentity,
  findUserIdByTelegramUsername,
  listActivePaidUsers,
  normalizeTelegramUsername,
  getQuotaState,
  incrementGenerationCount,
  setUserPlan,
  isPaidTierActive,
  planDurationDays,
};
