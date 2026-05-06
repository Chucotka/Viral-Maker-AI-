const { GoogleGenerativeAI } = require('@google/generative-ai');
const { generateContentRobust, modelFallbackChain } = require('../lib/geminiRobust');
const { resolveTelegramUser } = require('../lib/miniAppAuth');
const { isKvConfigured, getQuotaState, incrementGenerationCount } = require('../lib/kvUserStore');
const { appendUserHistory } = require('../lib/kvHistory');
const { computeViralScore } = require('../lib/viralScore');
const { buildStudioTextPrompt } = require('../lib/buildTextPrompt');
const { assertGenerateRateLimit } = require('../lib/rateLimitKv');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    if (!isKvConfigured()) {
      return res.status(503).json({
        error: 'kv_required',
        message: 'Подключите Upstash Redis (UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN) в проекте.',
      });
    }

    const auth = resolveTelegramUser(req, res);
    if (!auth) return;

    const { topic, platform = 'Telegram', tone = 'вирусный', model = 'gemini-2.5-flash', intent = 'auto' } = req.body;

    if (!topic || topic.trim().length === 0) {
      return res.status(400).json({ error: 'topic_required', message: 'Тема не указана.' });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: 'missing_api_key' });
    }

    const { rec, limit } = await getQuotaState(auth.userId);
    if (rec.dailyCount >= limit) {
      return res.status(403).json({ error: 'limit_reached', message: 'Лимит исчерпан. Перейди на Pro.' });
    }

    if (!(await assertGenerateRateLimit(auth.userId, res, rec.plan))) return;

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const modelChain = modelFallbackChain(model);

    const prompt = buildStudioTextPrompt({
      topic,
      platform,
      tone,
      intent,
      profile: rec,
    });

    const { content, modelUsed } = await generateContentRobust(genAI, modelChain, prompt);
    const { remainingToday } = await incrementGenerationCount(auth.userId, rec);
    const viralScore = computeViralScore(content);

    try {
      await appendUserHistory(auth.userId, {
        type: 'text',
        topic: topic.trim().slice(0, 240),
        text: content.slice(0, 4000),
        score: viralScore,
        platform,
      });
    } catch (histErr) {
      console.error('appendUserHistory:', histErr.message);
    }

    res.json({
      content,
      viralScore,
      model: modelUsed,
      remainingToday,
    });
  } catch (e) {
    console.error('ULTIMATE GENERATION ERROR:', e.message);
    res.status(500).json({ error: e.message });
  }
};
