// 1.5 и 2.0-flash для новых ключей часто дают 404; остаётся линейка 2.5+.
const ALLOWED_MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const { getGeminiSdkRequestOptions } = require('./geminiNetwork');

/** Безопасное имя модели из запроса + порядок запасных вариантов при перегрузке API. */
function modelFallbackChain(preferred, options = {}) {
  const { freeTier } = options;
  const p = ALLOWED_MODELS.includes(preferred) ? preferred : 'gemini-2.5-flash';
  if (freeTier) {
    return ['gemini-2.5-flash', 'gemini-2.5-flash-lite'];
  }
  const tail = ALLOWED_MODELS.filter((m) => m !== p);
  return [p, ...tail];
}

function isRetryableGeminiError(err) {
  const status = err?.status ?? err?.statusCode ?? err?.code;
  const msg = String(err?.message ?? '');
  if (status === 503 || status === 429) return true;
  if (/503|429|UNAVAILABLE|RESOURCE_EXHAUSTED|high demand|too many requests/i.test(msg)) return true;
  return false;
}

/**
 * Вызывает generateContent с экспоненциальными повторами при 503/429 и переходом на запасные модели.
 * @param {import('@google/generative-ai').GoogleGenerativeAI} genAI
 * @param {string[]} modelChain — порядок моделей (первая предпочтительная)
 * @param {string} prompt
 * @param {{ maxAttemptsPerModel?: number }} [opts]
 * @returns {Promise<{ content: string, modelUsed: string }>}
 */
async function generateContentRobust(genAI, modelChain, prompt, opts = {}) {
  const maxAttemptsPerModel = opts.maxAttemptsPerModel ?? 4;
  const parts = Array.isArray(opts.parts) && opts.parts.length ? opts.parts : null;
  let lastErr;

  for (const modelName of modelChain) {
    const model = genAI.getGenerativeModel({ model: modelName }, getGeminiSdkRequestOptions());
    for (let attempt = 0; attempt < maxAttemptsPerModel; attempt++) {
      try {
        const result = parts
          ? await model.generateContent({ contents: [{ role: 'user', parts }] })
          : await model.generateContent(prompt);
        const content = result.response.text();
        return { content, modelUsed: modelName };
      } catch (e) {
        lastErr = e;
        const retryable = isRetryableGeminiError(e);
        const lastAttempt = attempt === maxAttemptsPerModel - 1;
        if (!retryable || lastAttempt) break;
        const base = 600 * 2 ** attempt;
        const jitter = Math.floor(Math.random() * 400);
        await sleep(Math.min(base + jitter, 8000));
      }
    }
  }

  throw lastErr;
}

module.exports = {
  generateContentRobust,
  isRetryableGeminiError,
  modelFallbackChain,
  ALLOWED_MODELS,
};
