const { generateGeminiImage } = require('../lib/geminiImageRest');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const {
      prompt: rawPrompt,
      aspectRatio = '1:1',
      style = '',
    } = req.body;

    const prompt = String(rawPrompt || '').trim();
    if (!prompt) {
      return res.status(400).json({ error: 'prompt_required', message: 'Введите описание картинки.' });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: 'missing_api_key' });
    }

    const styleBit = String(style || '').trim();
    const fullPrompt = styleBit
      ? `${prompt}. Стиль и настроение: ${styleBit}. Высокое качество, чёткие детали.`
      : `${prompt}. Высокое качество, чёткие детали, яркая композиция.`;

    const { mimeType, dataBase64, modelUsed } = await generateGeminiImage({
      apiKey: process.env.GEMINI_API_KEY,
      prompt: fullPrompt,
      aspectRatio,
    });

    res.json({
      mimeType,
      imageBase64: dataBase64,
      dataUrl: `data:${mimeType};base64,${dataBase64}`,
      model: modelUsed,
    });
  } catch (e) {
    console.error('IMAGE GENERATION ERROR:', e.message);
    res.status(500).json({ error: e.message });
  }
};
