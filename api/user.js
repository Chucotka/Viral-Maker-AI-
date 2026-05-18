const { resolveTelegramUser } = require('../lib/miniAppAuth');
const { isKvConfigured, getQuotaState, saveUserRecord, saveTelegramIdentity } = require('../lib/kvUserStore');

function sanitizeProfileBody(body) {
  const niche = typeof body?.niche === 'string' ? body.niche.trim().slice(0, 120) : '';
  const language = typeof body?.language === 'string' ? body.language.trim().slice(0, 40) : '';
  const styleNote = typeof body?.styleNote === 'string' ? body.styleNote.trim().slice(0, 200) : '';
  const brandMemory = typeof body?.brandMemory === 'string' ? body.brandMemory.trim().slice(0, 1000) : '';
  return { niche, language, styleNote, brandMemory };
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
      const { rec } = await getQuotaState(auth.userId);
      return res.json({
        plan: rec.plan,
        dailyCount: rec.dailyCount,
        userId: auth.userId,
        planUntil: rec.planUntil || null,
        profile: {
          niche: rec.niche || '',
          language: rec.language || '',
          styleNote: rec.styleNote || '',
          brandMemory: rec.brandMemory || '',
        },
      });
    }

    if (req.method === 'POST') {
      const { niche, language, styleNote, brandMemory } = sanitizeProfileBody(req.body || {});
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
