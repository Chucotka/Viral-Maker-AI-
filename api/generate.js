const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');

module.exports = async (req, res) => {
  console.log('GEMINI KEY:', process.env.GEMINI_API_KEY ? 'EXISTS' : 'MISSING');
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const { topic, platform = 'Telegram', tone = 'вирусный', model = 'gemini-2.0-flash', userId = 'anonymous' } = req.body;
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    const usersPath = '/tmp/users.json';
    let users = {};
    try { users = JSON.parse(fs.readFileSync(usersPath, 'utf8')); } catch(e) {}
    const today = new Date().toISOString().split('T')[0];
    if (!users[userId]) users[userId] = { plan: 'free', dailyCount: 0, lastReset: today };
    if (users[userId].lastReset !== today) { users[userId].dailyCount = 0; users[userId].lastReset = today; }
    if (users[userId].plan !== 'pro' && users[userId].dailyCount >= 5) {
      return res.status(403).json({ error: 'limit_reached', message: 'Лимит исчерпан. Перейди на Pro.' });
    }

    const selectedModel = genAI.getGenerativeModel({ model });
    const prompt = `Ты эксперт по вирусному контенту для ${platform}. Тон: ${tone}. Создай вирусный пост на тему: ${topic}. Добавь 3-5 эмодзи. Закончи призывом к действию. Максимум 1000 символов.`;
    const result = await selectedModel.generateContent(prompt);
    const content = result.response.text();

    users[userId].dailyCount++;
    fs.writeFileSync(usersPath, JSON.stringify(users));

    let score = 30;
    const trendKeywords = ['ai','нейросеть','chatgpt','будущее','bitcoin','крипта','деньги','успех'];
    trendKeywords.forEach(k => { if (content.toLowerCase().includes(k)) score += 20; });
    const emojiCount = (content.match(/[\u{1F600}-\u{1F64F}]/gu) || []).length;
    score += Math.min(emojiCount * 10, 30);
    if (content.includes('?')) score += 25;
    score = Math.min(score, 100);

    res.json({ content, viralScore: score });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
};