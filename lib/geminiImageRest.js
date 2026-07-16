const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const { getGeminiApiBase, buildGeminiHeaders } = require('./geminiNetwork');

const IMAGE_MODEL_CHAIN = ['gemini-2.5-flash-image', 'gemini-3.1-flash-image-preview'];

function isRetryable(err) {
  const st = err?.status;
  const msg = String(err?.message || '');
  if (st === 503 || st === 429) return true;
  return /503|429|UNAVAILABLE|RESOURCE_EXHAUSTED|high demand/i.test(msg);
}

function extractInlineImage(data) {
  const feedback = data?.promptFeedback;
  if (feedback?.blockReason) {
    const err = new Error(`Запрос отклонён политикой: ${feedback.blockReason}`);
    err.status = 400;
    throw err;
  }
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) {
    const err = new Error('Пустой ответ модели. Попробуйте другой промпт.');
    err.status = 502;
    throw err;
  }
  for (const part of parts) {
    const inline = part.inlineData || part.inline_data;
    if (inline?.data) {
      const mime = inline.mimeType || inline.mime_type || 'image/png';
      return { mimeType: mime, dataBase64: inline.data };
    }
  }
  const err = new Error('В ответе нет изображения. Уточните описание или попробуйте снова.');
  err.status = 502;
  throw err;
}

async function callGenerateContent(apiKey, model, prompt, aspectRatio, referenceImage) {
  const url = `${getGeminiApiBase()}/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const generationConfig = {
    responseModalities: ['IMAGE'],
  };
  if (aspectRatio) {
    generationConfig.imageConfig = { aspectRatio };
  }
  const parts = [{ text: prompt }];
  if (referenceImage?.dataBase64) {
    parts.push({
      inlineData: {
        mimeType: referenceImage.mimeType,
        data: referenceImage.dataBase64,
      },
    });
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: buildGeminiHeaders(apiKey),
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      generationConfig,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || res.statusText || 'Ошибка API';
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return extractInlineImage(data);
}

/**
 * @param {{ apiKey: string, prompt: string, aspectRatio?: string }} opts
 * @returns {Promise<{ mimeType: string, dataBase64: string, modelUsed: string }>}
 */
async function generateGeminiImage(opts) {
  const { apiKey, prompt, aspectRatio = '1:1', referenceImage = null } = opts;
  let lastErr;

  for (const model of IMAGE_MODEL_CHAIN) {
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const { mimeType, dataBase64 } = await callGenerateContent(
          apiKey,
          model,
          prompt,
          aspectRatio,
          referenceImage,
        );
        return { mimeType, dataBase64, modelUsed: model };
      } catch (e) {
        lastErr = e;
        if (e.status === 404) break;
        if (!isRetryable(e) || attempt === 3) break;
        const base = 600 * 2 ** attempt;
        const jitter = Math.floor(Math.random() * 400);
        await sleep(Math.min(base + jitter, 8000));
      }
    }
  }

  throw lastErr || new Error('Не удалось сгенерировать изображение');
}

module.exports = { generateGeminiImage, IMAGE_MODEL_CHAIN };
