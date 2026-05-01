const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function generateContent({ topic, platform, tone, model = 'gemini-1.5-flash' }) {
  const geminiModel = genAI.getGenerativeModel({ model });

  const prompt = `Ты эксперт по вирусному контенту для ${platform}.
Тон: ${tone}.
Создай вирусный пост на тему: ${topic}.
Всегда заканчивай призывом к действию.
Добавляй 3-5 релевантных эмодзи.
Максимум 1000 символов для Telegram.`;

  const result = await geminiModel.generateContent(prompt);
  return result.response.text();
}

module.exports = { generateContent };
