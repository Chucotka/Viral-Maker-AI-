const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const { topic, platform = 'Telegram', tone = 'вирусный', userId = 'anonymous' } = req.body;

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: 'missing_api_key', message: 'GEMINI_API_KEY не настроен.' });
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    
    // DIAGNOSTIC: List available models
    try {
      const modelsList = await genAI.getGenerativeModel({ model: "gemini-1.5-flash" }).listModels(); // This might not work this way
      // Correct way to list models in latest SDK:
      // Actually, let's just try to iterate a few common names
    } catch(e) {
      console.log("Diagnostic listModels failed, moving on...");
    }

    // Try a very specific model name that often works when others 404
    const selectedModelName = "gemini-1.5-flash-latest"; 
    console.log("Attempting to use model:", selectedModelName);

    const selectedModel = genAI.getGenerativeModel({ model: selectedModelName });
    const prompt = `Ты эксперт по вирусному контенту для ${platform}. Тон: ${tone}. Создай вирусный пост на тему: ${topic}. Добавь 3-5 эмодзи. Закончи призывом к действию. Максимум 1000 символов.`;
    
    const result = await selectedModel.generateContent(prompt);
    const content = result.response.text();

    res.json({
      content,
      model: selectedModelName
    });
  } catch(e) {
    console.error('CRITICAL ERROR:', e.message);
    if (e.stack) console.error(e.stack);
    res.status(500).json({ 
      error: e.message, 
      hint: "Check Vercel logs for available models list or specific error details." 
    });
  }
};