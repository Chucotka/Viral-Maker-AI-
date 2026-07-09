const { createGenerativeAI, getGeminiSdkRequestOptions } = require('./geminiNetwork');
const { modelFallbackChain } = require('./geminiRobust');

/**
 * Минимальный запрос к Gemini для диагностики (health / scripts).
 * @returns {Promise<{ ok: boolean, model?: string, ms?: number, error?: string }>}
 */
async function probeGeminiText(env = process.env) {
  const apiKey = String(env.GEMINI_API_KEY || '').trim();
  if (!apiKey) {
    return { ok: false, error: 'missing GEMINI_API_KEY' };
  }

  const started = Date.now();
  try {
    const genAI = createGenerativeAI(apiKey);
    const [modelName] = modelFallbackChain('gemini-2.5-flash-lite');
    const model = genAI.getGenerativeModel({ model: modelName }, getGeminiSdkRequestOptions());
    const result = await model.generateContent('Ответь одним словом: ок');
    const text = String(result.response.text() || '').trim();
    if (!text) {
      return { ok: false, error: 'empty response', ms: Date.now() - started };
    }
    return { ok: true, model: modelName, ms: Date.now() - started, sample: text.slice(0, 40) };
  } catch (e) {
    return {
      ok: false,
      error: e && typeof e === 'object' && 'message' in e ? String(e.message) : String(e),
      ms: Date.now() - started,
    };
  }
}

module.exports = { probeGeminiText };
