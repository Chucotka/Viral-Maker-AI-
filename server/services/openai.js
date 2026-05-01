const { OpenAI } = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function generateContent({ topic, platform, tone, model }) {
  const systemPrompt = `Ты эксперт по вирусному контенту для ${platform}.
  Создавай посты которые хочется репостить.
  Тон: ${tone}.
  Всегда заканчивай призывом к действию.
  Добавляй 3-5 релевантных эмодзи.
  Максимум 280 символов для TikTok/Instagram, 1000 для Telegram.`;

  const response = await openai.chat.completions.create({
    model: model || 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Тема: ${topic}` }
    ]
  });

  return response.choices[0].message.content;
}

module.exports = { generateContent };
