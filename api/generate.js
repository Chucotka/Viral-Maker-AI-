const { GoogleGenerativeAI } = require('@google/generative-ai');
const { modelFallbackChain } = require('../lib/geminiRobust');
const { resolveTelegramUser } = require('../lib/miniAppAuth');
const { isKvConfigured, getQuotaState, incrementGenerationCount } = require('../lib/kvUserStore');
const { appendUserHistory, getUserHistory } = require('../lib/kvHistory');
const { buildStudioTextPrompt, inferPostGoal } = require('../lib/buildTextPrompt');
const { generateStudioTextContent } = require('../lib/textGeneration');
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

    const { topic, platform = 'Telegram', tone = 'вирусный', model = 'gemini-2.5-flash', intent = 'auto', risk = 'balanced' } = req.body;

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
    let recentHistory = [];
    try {
      recentHistory = await getUserHistory(auth.userId, 20);
    } catch (histErr) {
      console.error('getUserHistory:', histErr.message);
    }

    const goal = inferPostGoal({
      topic,
      intent,
      profile: rec,
      recentHistory,
      risk,
    });
    const prompt = buildStudioTextPrompt({
      topic,
      platform,
      tone,
      intent,
      risk,
      profile: rec,
      recentHistory,
      goal,
    });

    const {
      content,
      modelUsed,
      viralScore,
      draftScore,
      rewriteApplied,
      selectedAngle,
      candidateCount,
      candidateSummary,
      criticScore,
      criticNeedsRewrite,
      criticVerdict,
      criticIssues,
      criticStrengths,
      criticBreakdown,
      alternateContent,
      alternateAngle,
      alternateScore,
      goal: detectedGoal,
      pipelineMode,
      generationMs,
    } = await generateStudioTextContent(
      genAI,
      modelChain,
      prompt,
      {
        topic,
        platform,
        tone,
        intent,
        risk,
        profile: rec,
        recentHistory,
        goal,
        plan: rec.plan,
        paidTierActive: limit === Infinity,
      },
    );
    const { remainingToday } = await incrementGenerationCount(auth.userId, rec);

    const historyTs = Date.now();
    try {
      await appendUserHistory(auth.userId, {
        ts: historyTs,
        type: 'text',
        topic: topic.trim().slice(0, 240),
        text: content.slice(0, 4000),
        score: viralScore,
        platform,
        risk,
        goal: detectedGoal || goal,
        selectedAngle,
        rewriteApplied: !!rewriteApplied,
        candidateCount: Number(candidateCount) || 0,
        criticScore: Number(criticScore) || 0,
        criticNeedsRewrite: !!criticNeedsRewrite,
        criticVerdict: criticVerdict || '',
        criticIssues: Array.isArray(criticIssues) ? criticIssues.slice(0, 4) : [],
        criticStrengths: Array.isArray(criticStrengths) ? criticStrengths.slice(0, 4) : [],
        criticBreakdown: criticBreakdown || {},
        alternateText: alternateContent || '',
        alternateAngle: alternateAngle || '',
        alternateScore: Number(alternateScore) || 0,
        pipelineMode: pipelineMode || '',
        generationMs: Number(generationMs) || 0,
      });
    } catch (histErr) {
      console.error('appendUserHistory:', histErr.message);
    }

    res.json({
      content,
      viralScore,
      draftScore,
      model: modelUsed,
      risk,
      goal: detectedGoal || goal,
      rewriteApplied,
      selectedAngle,
      candidateCount,
      candidateSummary,
      criticScore,
      criticNeedsRewrite,
      criticVerdict,
      criticIssues,
      criticStrengths,
      criticBreakdown,
      alternateContent,
      alternateAngle,
      alternateScore,
      pipelineMode,
      generationMs,
      historyTs,
      remainingToday,
    });
  } catch (e) {
    console.error('ULTIMATE GENERATION ERROR:', e.message);
    res.status(500).json({ error: e.message });
  }
};
