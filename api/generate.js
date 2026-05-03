const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    // Default to gemini-1.5-pro as it's more widely available in all tiers
    const { topic, platform = 'Telegram', tone = 'вирусный', model = 'gemini-1.5-pro', userId = 'anonymous' } = req.body;

    if (!topic || topic.trim().length === 0) {
      return res.status(400).json({ error: 'topic_required', message: 'Тема не указана.' });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: 'missing_api_key', message: 'GEMINI_API_KEY не настроен в Vercel.' });
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    const usersPath = '/tmp/users.json';
    let users = {};
    try { 
      if (fs.existsSync(usersPath)) {
        users = JSON.parse(fs.readFileSync(usersPath, 'utf8')); 
      }
    } catch(e) {}

    const today = new Date().toISOString().split('T')[0];
    if (!users[userId]) users[userId] = { plan: 'free', dailyCount: 0, lastReset: today };
    if (users[userId].lastReset !== today) { users[userId].dailyCount = 0; users[userId].lastReset = today; }
    
    // Check limits
    if (users[userId].plan !== 'pro' && users[userId].dailyCount >= 5) {
      return res.status(403).json({ error: 'limit_reached', message: 'Лимит исчерпан. Перейди на Pro.' });
    }

    // Determine model to use
    let selectedModelName = model;
    if (users[userId].plan === 'free') {
      selectedModelName = 'gemini-1.5-pro'; // Using pro for free too for reliability during test
    }

    const selectedModel = genAI.getGenerativeModel({ model: selectedModelName });
    const prompt = `Ты эксперт по вирусному контенту для ${platform}. Тон: ${tone}. Создай вирусный пост на тему: ${topic}. Добавь 3-5 эмодзи. Закончи призывом к действию. Максимум 1000 символов.`;
    
    const result = await selectedModel.generateContent(prompt);
    const content = result.response.text();

    users[userId].dailyCount++;
    try { fs.writeFileSync(usersPath, JSON.stringify(users)); } catch(e) {}

    // Viral score calculation
    let score = 30;
    const trendKeywords = ['ai', 'нейросеть', 'chatgpt', 'будущее', 'bitcoin', 'крипта', 'деньги', 'успех'];
    trendKeywords.forEach(k => { if (content.toLowerCase().includes(k)) score += 20; });
    const emotionalWords = ['вау', 'безумно', 'шок', 'невероятно', 'топ'];
    emotionalWords.forEach(w => { if (content.toLowerCase().includes(w)) score += 15; });
    const emojiCount = (content.match(/[\u{1F600}-\u{1F64F}|\u{1F300}-\u{1F5FF}]/gu) || []).length;
    score += Math.min(emojiCount * 10, 30);
    if (content.includes('?')) score += 25;
    if (content.includes('подписывайся') || content.includes('лайк') || content.includes('репост')) score += 20;
    score = Math.min(score, 100);

    res.json({
      content,
      viralScore: score,
      model: selectedModelName,
      remainingToday: Math.max(0, 5 - users[userId].dailyCount)
    });
  } catch(e) {
    console.error('Generate error details:', e);
    res.status(500).json({ error: e.message });
  }
};