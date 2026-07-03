const { isGuestUserId } = require('./webGuest');
const { getUserRecord, saveUserRecord, saveTelegramIdentity, isPaidTierActive } = require('./kvUserStore');
const { getUserHistory } = require('./kvHistory');
const { getRedisClient, isKvConfigured } = require('./redisClient');

const USER_PREFIX = 'vm:user:';
const HIST_PREFIX = 'vm:hist:';
const MERGED_PREFIX = 'vm:guest_merged:';

function pickString(primary, fallback) {
  const a = String(primary || '').trim();
  if (a) return a;
  return String(fallback || '').trim();
}

function mergeUserRecords(guestRec, tgRec) {
  const guestPaid = isPaidTierActive(guestRec);
  const tgPaid = isPaidTierActive(tgRec);

  let plan = tgRec.plan || 'free';
  let planUntil = tgRec.planUntil || null;
  if (guestPaid && !tgPaid) {
    plan = guestRec.plan;
    planUntil = guestRec.planUntil;
  } else if (guestPaid && tgPaid) {
    const guestEnd = new Date(guestRec.planUntil).getTime();
    const tgEnd = new Date(tgRec.planUntil).getTime();
    if (Number.isFinite(guestEnd) && (!Number.isFinite(tgEnd) || guestEnd > tgEnd)) {
      plan = guestRec.plan;
      planUntil = guestRec.planUntil;
    }
  }

  const unseen = new Set([
    ...(Array.isArray(tgRec.unseenReferralRewards) ? tgRec.unseenReferralRewards : []),
    ...(Array.isArray(guestRec.unseenReferralRewards) ? guestRec.unseenReferralRewards : []),
  ]);

  return {
    ...tgRec,
    plan,
    planUntil,
    dailyCount: Math.max(Number(guestRec.dailyCount) || 0, Number(tgRec.dailyCount) || 0),
    niche: pickString(tgRec.niche, guestRec.niche),
    language: pickString(tgRec.language, guestRec.language),
    styleNote: pickString(tgRec.styleNote, guestRec.styleNote),
    brandMemory: pickString(tgRec.brandMemory, guestRec.brandMemory),
    bonusGenerations: (Number(guestRec.bonusGenerations) || 0) + (Number(tgRec.bonusGenerations) || 0),
    referralCount: Math.max(Number(guestRec.referralCount) || 0, Number(tgRec.referralCount) || 0),
    totalReferralReward: Math.max(Number(guestRec.totalReferralReward) || 0, Number(tgRec.totalReferralReward) || 0),
    referrerId: tgRec.referrerId || guestRec.referrerId || null,
    referralConfirmed: Boolean(tgRec.referralConfirmed || guestRec.referralConfirmed),
    referralMilestone5: Boolean(tgRec.referralMilestone5 || guestRec.referralMilestone5),
    referralMilestone10: Boolean(tgRec.referralMilestone10 || guestRec.referralMilestone10),
    unseenReferralRewards: [...unseen],
    lastPaidPlan: tgRec.lastPaidPlan || guestRec.lastPaidPlan || null,
    lastPaidUntil: tgRec.lastPaidUntil || guestRec.lastPaidUntil || null,
    lastSeen: tgRec.lastSeen || guestRec.lastSeen || null,
  };
}

function mergeHistoryLists(guestList, tgList, maxItems = 50) {
  const byKey = new Map();
  for (const item of [...(guestList || []), ...(tgList || [])]) {
    if (!item || typeof item !== 'object') continue;
    const ts = Number(item.ts) || 0;
    const type = String(item.type || 'text');
    const key = `${type}:${ts}`;
    if (!byKey.has(key)) byKey.set(key, item);
  }
  return [...byKey.values()]
    .sort((a, b) => (Number(b.ts) || 0) - (Number(a.ts) || 0))
    .slice(0, maxItems);
}

/**
 * Переносит данные гостя web_* на Telegram user id (один аккаунт везде).
 */
async function mergeGuestIntoTelegram(guestUserId, telegramUserId, telegramUser) {
  const guestId = String(guestUserId || '');
  const tgId = String(telegramUserId || '');
  if (!isGuestUserId(guestId) || !tgId || guestId === tgId) {
    return { merged: false, reason: 'skip' };
  }
  if (!isKvConfigured()) {
    return { merged: false, reason: 'no_kv' };
  }

  const kv = getRedisClient();
  const guestRec = await getUserRecord(guestId);
  const tgRec = await getUserRecord(tgId);
  const mergedRec = mergeUserRecords(guestRec, tgRec);
  await saveUserRecord(tgId, mergedRec);
  if (telegramUser) await saveTelegramIdentity(tgId, telegramUser);

  const guestHist = await getUserHistory(guestId, 50);
  const tgHist = await getUserHistory(tgId, 50);
  const mergedHist = mergeHistoryLists(guestHist, tgHist);
  if (mergedHist.length) {
    await kv.set(HIST_PREFIX + tgId, mergedHist);
  }

  await kv.del(USER_PREFIX + guestId);
  await kv.del(HIST_PREFIX + guestId);
  await kv.set(`${MERGED_PREFIX}${guestId}`, tgId);

  return { merged: true, from: guestId, to: tgId };
}

function readGuestUserIdFromRequest(req) {
  const { readSessionToken, verifySession } = require('./webSession');
  const token = readSessionToken(req);
  const payload = token ? verifySession(token) : null;
  const sub = payload?.sub ? String(payload.sub) : '';
  if (!sub) return null;
  if (payload.authKind === 'guest' || isGuestUserId(sub)) return sub;
  return null;
}

module.exports = {
  mergeUserRecords,
  mergeHistoryLists,
  mergeGuestIntoTelegram,
  readGuestUserIdFromRequest,
};
