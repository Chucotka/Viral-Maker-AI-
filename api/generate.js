const { GoogleGenerativeAI } = require('@google/generative-ai');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const { topic, platform = 'Telegram', tone = 'вирусный' } = req.body;

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'missing_api_key' });
    }

    // DEBUG: Check key format (masking middle)
    console.log(`Using API Key: ${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}`);

    // Force API version v1
    const genAI = new GoogleGenerativeAI(apiKey);
    
    // Attempting to use v1 instead of default v1beta
    // The SDK allows passing the version in the second argument of the constructor
    const genAIv1 = new GoogleGenerativeAI(apiKey); 
    
    // We'll try to use the most standard model name
    const modelName = "gemini-1.5-flash";
    console.log("Attempting to use model:", modelName, "on API v1 (hopefully)");

    const model = genAIv1.getGenerativeModel({ 
      model: modelName
    }, { apiVersion: 'v1' }); // Force v1 here

    const prompt = `Ты эксперт по вирусному контенту для ${platform}. Тон: ${tone}. Создай вирусный пост на тему: ${topic}. Добавь 3-5 эмодзи. Закончи призывом к действию. Максимум 1000 символов.`;
    
    const result = await model.generateContent(prompt);
    const content = result.response.text();

    res.json({
      content,
      model: modelName
    });
  } catch(e) {
    console.error('GENERATE ERROR:', e.message);
    if (e.status) console.error('Status:', e.status);
    res.status(500).json({ error: e.message });
  }
};