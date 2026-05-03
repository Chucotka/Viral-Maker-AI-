const { GoogleGenerativeAI } = require('@google/generative-ai');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const { topic, platform = 'Telegram', tone = 'вирусный' } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    const genAI = new GoogleGenerativeAI(apiKey);
    
    // List of models to try in order of preference
    const modelsToTry = [
      "gemini-1.5-flash",
      "gemini-1.5-pro",
      "gemini-pro",
      "gemini-1.0-pro",
      "models/gemini-1.5-flash",
      "models/gemini-pro"
    ];

    let lastError = null;
    let successfulModel = null;
    let content = null;

    for (const modelName of modelsToTry) {
      try {
        console.log(`Trying model: ${modelName}...`);
        const model = genAI.getGenerativeModel({ model: modelName });
        const prompt = `Ты эксперт по вирусному контенту для ${platform}. Тон: ${tone}. Создай вирусный пост на тему: ${topic}. Добавь 3-5 эмодзи. Закончи призывом к действию.`;
        
        const result = await model.generateContent(prompt);
        content = result.response.text();
        successfulModel = modelName;
        console.log(`Success with model: ${modelName}!`);
        break; // Stop if success
      } catch (e) {
        console.log(`Failed with ${modelName}: ${e.message}`);
        lastError = e;
      }
    }

    if (content) {
      return res.json({
        content,
        model: successfulModel
      });
    }

    // If all failed, try to list models to see what's actually there
    let availableModels = [];
    try {
      // In some SDK versions, it's genAI.listModels()
      // But let's try to get it via a dummy model instance if needed
      // Actually, listModels is often not available in the simple SDK
    } catch(e) {}

    res.status(500).json({ 
      error: "All models failed", 
      details: lastError ? lastError.message : "Unknown error",
      tried: modelsToTry
    });

  } catch(e) {
    console.error('FINAL ERROR:', e.message);
    res.status(500).json({ error: e.message });
  }
};