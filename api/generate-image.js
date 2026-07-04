const { GoogleGenerativeAI } = require('@google/generative-ai');
const { modelFallbackChain, generateContentRobust } = require('../lib/geminiRobust');
const { generateGeminiImage } = require('../lib/geminiImageRest');
const { resolveTelegramUser } = require('../lib/miniAppAuth');
const { isKvConfigured, getQuotaState, incrementGenerationCount } = require('../lib/kvUserStore');
const { confirmReferralAfterFirstGeneration } = require('../lib/referralService');
const { appendUserHistory, getUserHistory } = require('../lib/kvHistory');
const {
  buildImageModelPrompt,
  buildSurpriseImageModelPrompt,
  buildImageEnhancePrompt,
  isUsableImageEnhancement,
  stripImagePromptFences,
  isSurpriseRequest,
} = require('../lib/buildTextPrompt');
const { assertGenerateRateLimit } = require('../lib/rateLimitKv');
const { sendMappedError } = require('../lib/httpErrors');
const {
  putImageDownload,
  buildDownloadFileName,
  buildDownloadUrl,
} = require('../lib/tempImageDownload');

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

    const { rec, quota } = await getQuotaState(auth.userId);
    if (!quota.canGenerate) {
      return res.status(403).json({ error: 'limit_reached', message: 'Лимит исчерпан. Перейди на Pro или пригласи друзей.' });
    }

    if (!(await assertGenerateRateLimit(auth.userId, res, rec.plan))) return;

    const styleBit = String(style || '').trim();
    let recentHistory = [];
    try {
      recentHistory = await getUserHistory(auth.userId, 20);
    } catch (histErr) {
      console.error('getUserHistory:', histErr.message);
    }
    let imagePrompt = isSurpriseRequest(prompt)
      ? buildSurpriseImageModelPrompt({ aspectRatio, style: styleBit, profile: rec, recentHistory, risk })
      : buildImageModelPrompt({
          prompt,
          aspectRatio,
          style: styleBit,
          profile: rec,
          recentHistory,
        });
    let directorApplied = false;
    if (!isSurpriseRequest(prompt)) {
      try {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const enhancePrompt = buildImageEnhancePrompt({
          userPrompt: prompt,
          aspectRatio,
          style: styleBit,
          profile: rec,
          recentHistory,
          risk,
        });
        const critique = await generateContentRobust(genAI, modelFallbackChain('gemini-2.5-flash'), enhancePrompt, {});
        const revised = stripImagePromptFences(critique.content || '');
        if (isUsableImageEnhancement(revised, prompt)) {
          imagePrompt = revised;
          directorApplied = true;
        }
      } catch (criticErr) {
        console.error('image enhance:', criticErr.message);
      }
    }

    const { mimeType, dataBase64, modelUsed } = await generateGeminiImage({
      apiKey: process.env.GEMINI_API_KEY,
      prompt: imagePrompt,
      aspectRatio,
    });

    const { remainingToday } = await incrementGenerationCount(auth.userId, rec);
    await confirmReferralAfterFirstGeneration(auth.userId);

    const historyTs = Date.now();
    try {
      await appendUserHistory(auth.userId, {
        ts: historyTs,
        type: 'image',
        prompt: prompt.slice(0, 240),
        directorApplied: !!directorApplied,
      });
    } catch (histErr) {
      console.error('appendUserHistory:', histErr.message);
    }

    let downloadToken = null;
    let downloadUrl = null;
    const downloadFileName = buildDownloadFileName(mimeType);
    try {
      downloadToken = await putImageDownload(auth.userId, dataBase64, mimeType);
      downloadUrl = buildDownloadUrl(req, downloadToken);
    } catch (dlErr) {
      console.error('image download token:', dlErr.message);
    }

    res.json({
      mimeType,
      imageBase64: dataBase64,
      dataUrl: `data:${mimeType};base64,${dataBase64}`,
      model: modelUsed,
      directorApplied,
      historyTs,
      remainingToday,
      downloadToken,
      downloadUrl,
      downloadFileName,
    });
  } catch (e) {
    console.error('IMAGE GENERATION ERROR:', e.message);
    sendMappedError(res, e, 'generate-image');
  }
};
