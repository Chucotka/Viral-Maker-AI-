const { GoogleGenerativeAI } = require('@google/generative-ai');
const { modelFallbackChain, generateContentRobust } = require('../lib/geminiRobust');
const { generateGeminiImage } = require('../lib/geminiImageRest');
const { resolveTelegramUser } = require('../lib/miniAppAuth');
const { isKvConfigured, getQuotaState, incrementGenerationCount } = require('../lib/kvUserStore');
const { appendUserHistory, getUserHistory } = require('../lib/kvHistory');
const {
  buildImageGenerationPrompt,
  buildImageCriticPrompt,
  buildSurpriseImagePrompt,
  isSurpriseRequest,
} = require('../lib/buildTextPrompt');
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

    const { prompt: rawPrompt, aspectRatio = '1:1', style = '', risk = 'balanced' } = req.body;

    const prompt = String(rawPrompt || '').trim();
    if (!prompt) {
      return res.status(400).json({ error: 'prompt_required', message: 'Введите описание картинки.' });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: 'missing_api_key' });
    }

    const { rec, limit } = await getQuotaState(auth.userId);
    if (rec.dailyCount >= limit) {
      return res.status(403).json({ error: 'limit_reached', message: 'Лимит исчерпан. Перейди на Pro.' });
    }

    if (!(await assertGenerateRateLimit(auth.userId, res, rec.plan))) return;

    const styleBit = String(style || '').trim();
    let recentHistory = [];
    try {
      recentHistory = await getUserHistory(auth.userId, 20);
    } catch (histErr) {
      console.error('getUserHistory:', histErr.message);
    }
    const fullPrompt = isSurpriseRequest(prompt)
      ? buildSurpriseImagePrompt({ aspectRatio, style: styleBit, profile: rec, recentHistory, risk })
      : buildImageGenerationPrompt({
          prompt,
          aspectRatio,
          style: styleBit,
          profile: rec,
          recentHistory,
          risk,
        });
    let finalPrompt = fullPrompt;
    let directorApplied = false;
    try {
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const criticPrompt = buildImageCriticPrompt({
        basePrompt: fullPrompt,
        aspectRatio,
        style: styleBit,
        profile: rec,
        recentHistory,
        risk,
      });
      const critique = await generateContentRobust(genAI, modelFallbackChain('gemini-2.5-flash'), criticPrompt, {});
      const revised = String(critique.content || '').trim();
      if (revised) {
        finalPrompt = revised;
        directorApplied = true;
      }
    } catch (criticErr) {
      console.error('image director:', criticErr.message);
    }

    const { mimeType, dataBase64, modelUsed } = await generateGeminiImage({
      apiKey: process.env.GEMINI_API_KEY,
      prompt: finalPrompt,
      aspectRatio,
    });

    const { remainingToday } = await incrementGenerationCount(auth.userId, rec);

    const historyTs = Date.now();
    try {
      await appendUserHistory(auth.userId, {
        ts: historyTs,
        type: 'image',
        prompt: prompt.slice(0, 400),
        directorApplied: !!directorApplied,
      });
    } catch (histErr) {
      console.error('appendUserHistory:', histErr.message);
    }

    res.json({
      mimeType,
      imageBase64: dataBase64,
      dataUrl: `data:${mimeType};base64,${dataBase64}`,
      model: modelUsed,
      directorApplied,
      historyTs,
      remainingToday,
    });
  } catch (e) {
    console.error('IMAGE GENERATION ERROR:', e.message);
    res.status(500).json({ error: e.message });
  }
};
