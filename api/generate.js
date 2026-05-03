const { GoogleGenerativeAI } = require('@google/generative-ai');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const { topic, platform = 'Telegram', tone = 'вирусный', model = 'gemini-1.5-flash' } = req.body;

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: 'missing_api_key' });
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    
    // Use gemini-1.5-flash as default, it's fast and now we know it's there
    const modelInstance = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    console.log(`Generating content for topic: ${topic.substring(0, 50)}...`);

    const prompt = `Ты эксперт по вирусному контенту для ${platform}. Тон: ${tone}. Создай вирусный пост на тему: ${topic}. Добавь 3-5 эмодзи. Закончи призывом к действию. Максимум 1000 символов.`;
    
    const result = await modelInstance.generateContent(prompt);
    const response = await result.response;
    const content = response.text();

    console.log("Generation successful!");

    res.json({
      content,
      model: "gemini-1.5-flash"
    });
  } catch(e) {
    console.error('FINAL ERROR:', e.message);
    // Log more details to help debug if it fails again
    if (e.response && e.response.data) {
      console.error('Detailed Error Data:', JSON.stringify(e.response.data));
    }
    res.status(500).json({ error: e.message });
  }
};