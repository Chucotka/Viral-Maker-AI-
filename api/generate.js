const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const { topic, platform = 'Telegram', tone = 'вирусный', model = 'gemini-2.5-flash', userId = 'anonymous' } = req.body;

    if (!topic || topic.trim().length === 0) {
      return res.status(400).json({ error: 'topic_required', message: 'Тема не указана.' });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: 'missing_api_key' });
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    
    // Using Gemini 2.5 Flash - the NEW modern standard in May 2026
    const modelInstance = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const prompt = `Ты эксперт по вирусному контенту для ${platform}. Тон: ${tone}. Создай вирусный пост на тему: ${topic}. Добавь 3-5 эмодзи. Закончи призывом к действию. Максимум 1000 символов.`;
    
    const result = await modelInstance.generateContent(prompt);
    const content = result.response.text();

    res.json({
      content,
      viralScore: 85, // Fixed for now
      model: "gemini-2.5-flash"
    });

  } catch(e) {
    console.error('ULTIMATE GENERATION ERROR:', e.message);
    res.status(500).json({ error: e.message });
  }
};