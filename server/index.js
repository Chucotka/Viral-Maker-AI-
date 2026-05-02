const express = require('express');
const path = require('path');

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Health checks
app.get('/api/ping', (req, res) => res.send('pong'));
app.get('/api/test', (req, res) => res.json({ ok: true, token: !!process.env.TELEGRAM_BOT_TOKEN, gemini: !!process.env.GEMINI_API_KEY }));

// Webhook - standalone, no conditions
app.get('/api/webhook', (req, res) => res.json({ ok: true, message: 'webhook endpoint is alive' }));
app.post('/api/webhook', async (req, res) => {
  res.sendStatus(200);
  try {
    if (!process.env.TELEGRAM_BOT_TOKEN) {
      console.error('Missing TELEGRAM_BOT_TOKEN');
      return;
    }
    const { Bot } = require('grammy');
    const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN, {
      botInfo: {
        id: 1,
        is_bot: true,
        first_name: "Viral Maker AI",
        username: "viral_maker_ai_bot",
        can_join_groups: true,
        can_read_all_group_messages: true,
        supports_inline_queries: false,
      }
    });
    const webAppUrl = process.env.WEBAPP_URL || 'https://example.com';
    bot.command('start', async (ctx) => {
      await ctx.reply('🚀 Добро пожаловать в Viral Maker AI!\nГотов создавать вирусный контент?', {
        reply_markup: { inline_keyboard: [[{ text: '🚀 Открыть Viral Maker AI', web_app: { url: webAppUrl } }]] }
      });
    });
    bot.command('generate', async (ctx) => {
      await ctx.reply('Нажми кнопку ниже, чтобы открыть студию контента.', {
        reply_markup: { inline_keyboard: [[{ text: 'Создать контент', web_app: { url: webAppUrl } }]] }
      });
    });
    await bot.handleUpdate(req.body);
  } catch (e) {
    console.error('Webhook error:', e.message);
  }
});

// Generate content
app.post('/api/generate', async (req, res) => {
  try {
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const { topic, platform = 'Telegram', tone = 'вирусный', model = 'gemini-1.5-flash', userId = 'anonymous' } = req.body;

    const fs = require('fs');
    const usersPath = '/tmp/users.json';
    let users = {};
    try { users = JSON.parse(fs.readFileSync(usersPath, 'utf8')); } catch(e) {}

    const today = new Date().toISOString().split('T')[0];
    if (!users[userId]) users[userId] = { plan: 'free', dailyCount: 0, lastReset: today };
    if (users[userId].lastReset !== today) { users[userId].dailyCount = 0; users[userId].lastReset = today; }

    const limit = users[userId].plan === 'pro' ? Infinity : 5;
    if (users[userId].dailyCount >= limit) {
      return res.status(403).json({ error: 'limit_reached', message: 'Лимит исчерпан. Перейди на Pro.' });
    }

    const selectedModel = genAI.getGenerativeModel({ model: users[userId].plan === 'free' ? 'gemini-1.5-flash' : model });
    const prompt = `Ты эксперт по вирусному контенту для ${platform}. Тон: ${tone}. Создай вирусный пост на тему: ${topic}. Добавь 3-5 эмодзи. Закончи призывом к действию. Максимум 1000 символов.`;
    const result = await selectedModel.generateContent(prompt);
    const content = result.response.text();

    users[userId].dailyCount++;
    fs.writeFileSync(usersPath, JSON.stringify(users));

    // Viral score
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

    res.json({ content, viralScore: score });
  } catch (e) {
    console.error('Generate error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Trends
app.get('/api/trends', (req, res) => {
  res.json({ trends: [
    { name: 'Искусственный интеллект', score: 95, emoji: '🤖' },
    { name: 'Крипта', score: 88, emoji: '₿' },
    { name: 'Продуктивность', score: 82, emoji: '⚡️' },
    { name: 'Финансы', score: 79, emoji: '💰' },
    { name: 'Лайфстайл', score: 74, emoji: '✨' },
    { name: 'Здоровье', score: 71, emoji: '💪' }
  ]});
});

// User info
app.get('/api/user', (req, res) => {
  try {
    const fs = require('fs');
    let users = {};
    try { users = JSON.parse(fs.readFileSync('/tmp/users.json', 'utf8')); } catch(e) {}
    const userId = req.query.userId || req.query.id || 'anonymous';
    const user = users[userId] || { plan: 'free', dailyCount: 0 };
    res.json(user);
  } catch(e) {
    res.json({ plan: 'free', dailyCount: 0 });
  }
});

// Publish to channel
app.post('/api/publish', async (req, res) => {
  try {
    if (!process.env.TELEGRAM_BOT_TOKEN) {
      return res.status(500).json({ error: 'TELEGRAM_BOT_TOKEN is not configured.' });
    }
    const { Bot } = require('grammy');
    const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);
    const { content, channelUsername } = req.body;
    await bot.api.sendMessage(channelUsername, content);
    res.json({ ok: true });
  } catch(e) {
    res.status(500).json({ error: 'Не удалось опубликовать. Убедись что бот добавлен как администратор канала.' });
  }
});

module.exports = app;
