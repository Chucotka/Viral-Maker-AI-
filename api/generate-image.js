const { generateGeminiImage } = require('../lib/geminiImageRest');
const { resolveTelegramUser } = require('../lib/miniAppAuth');
const { isKvConfigured, getQuotaState, incrementGenerationCount } = require('../lib/kvUserStore');
const { appendUserHistory } = require('../lib/kvHistory');
const { profileImageHint } = require('../lib/buildTextPrompt');
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

    const { prompt: rawPrompt, aspectRatio = '1:1', style = '' } = req.body;

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
    const profileHint = profileImageHint(rec);
    const fullPrompt = styleBit
      ? `${prompt}. Стиль и настроение: ${styleBit}. Высокое качество, чёткие детали.${profileHint}`
      : `${prompt}. Высокое качество, чёткие детали, яркая композиция.${profileHint}`;

    const { mimeType, dataBase64, modelUsed } = await generateGeminiImage({
      apiKey: process.env.GEMINI_API_KEY,
      prompt: fullPrompt,
      aspectRatio,
    });

    const { remainingToday } = await incrementGenerationCount(auth.userId, rec);

    try {
      await appendUserHistory(auth.userId, {
        type: 'image',
        prompt: prompt.slice(0, 400),
      });
    } catch (histErr) {
      console.error('appendUserHistory:', histErr.message);
    }

    res.json({
      mimeType,
      imageBase64: dataBase64,
      dataUrl: `data:${mimeType};base64,${dataBase64}`,
      model: modelUsed,
      remainingToday,
    });
  } catch (e) {
    console.error('IMAGE GENERATION ERROR:', e.message);
    res.status(500).json({ error: e.message });
  }
};
