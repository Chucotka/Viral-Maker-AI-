const { resolveTelegramUser } = require('../lib/miniAppAuth');
const { isKvConfigured, getQuotaState, saveUserRecord, saveTelegramIdentity } = require('../lib/kvUserStore');
const {
  processReferralSignup,
  buildReferralStats,
  ackReferralRewards,
  parseReferrerId,
} = require('../lib/referralService');

function sanitizeProfileBody(body) {
  const niche = typeof body?.niche === 'string' ? body.niche.trim().slice(0, 120) : '';
  const language = typeof body?.language === 'string' ? body.language.trim().slice(0, 40) : '';
  const styleNote = typeof body?.styleNote === 'string' ? body.styleNote.trim().slice(0, 200) : '';
  const brandMemory = typeof body?.brandMemory === 'string' ? body.brandMemory.trim().slice(0, 1000) : '';
  return { niche, language, styleNote, brandMemory };
}

/** Извлекает start_param из query/body (fallback, если клиент передаёт явно). */
function readReferralParam(req, authStartParam) {
  if (authStartParam) return authStartParam;
  const q = req.query?.startapp || req.query?.start_param;
  if (typeof q === 'string' && q.trim()) return q.trim();
  const bodyParam = req.body?.startParam || req.body?.startapp;
  if (typeof bodyParam === 'string' && bodyParam.trim()) return bodyParam.trim();
  return null;
}

module.exports = async (req, res) => {
  try {
    if (!isKvConfigured()) {
      return res.status(503).json({
        error: 'kv_required',
        message: 'Подключите Upstash Redis (UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN).',
      });
    }

    const auth = resolveTelegramUser(req, res);
    if (!auth) return;
    await saveTelegramIdentity(auth.userId, auth.user);

    if (req.method === 'GET') {
      const referralParam = readReferralParam(req, auth.startParam);
      let referralSignup = null;
      if (referralParam && parseReferrerId(referralParam)) {
        referralSignup = await processReferralSignup(auth.userId, referralParam);
      }

      const { rec, quota } = await getQuotaState(auth.userId);
      const referral = buildReferralStats(rec, auth.userId);

      return res.json({
        plan: rec.plan,
        dailyCount: rec.dailyCount,
        userId: auth.userId,
        planUntil: rec.planUntil || null,
        bonusGenerations: rec.bonusGenerations || 0,
        quotaRemaining: quota.totalRemaining === Infinity ? null : quota.totalRemaining,
        profile: {
          niche: rec.niche || '',
          language: rec.language || '',
          styleNote: rec.styleNote || '',
          brandMemory: rec.brandMemory || '',
        },
        referral,
        referralSignup,
      });
    }

    if (req.method === 'POST') {
      const body = req.body || {};

      // Подтверждение просмотра реферальных наград (модалка milestone)
      if (body.ackReferralRewards) {
        const milestones = Array.isArray(body.ackReferralRewards)
          ? body.ackReferralRewards
          : [];
        await ackReferralRewards(auth.userId, milestones);
        const { rec, quota } = await getQuotaState(auth.userId);
        return res.json({
          ok: true,
          referral: buildReferralStats(rec, auth.userId),
          plan: rec.plan,
          planUntil: rec.planUntil || null,
          bonusGenerations: rec.bonusGenerations || 0,
          quotaRemaining: quota.totalRemaining === Infinity ? null : quota.totalRemaining,
        });
      }

      const { niche, language, styleNote, brandMemory } = sanitizeProfileBody(body);
      const { rec } = await getQuotaState(auth.userId);
      await saveUserRecord(auth.userId, { ...rec, niche, language, styleNote, brandMemory });
      return res.json({
        ok: true,
        profile: { niche, language, styleNote, brandMemory },
      });
    }

    return res.status(405).end();
  } catch (e) {
    console.error('User API error:', e.message);
    res.status(500).json({ error: e.message });
  }
};
