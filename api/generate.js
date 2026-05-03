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

    let prompt = `Ты эксперт по вирусному контенту для ${platform}. Тон: ${tone}. Создай вирусный пост на тему: ${topic}. Добавь 3-5 эмодзи. Закончи призывом к действию. Максимум 1000 символов.`;
    
    if (platform === 'YouTube Shorts') {
      prompt = `Ты эксперт по YouTube Shorts. Создай сценарий для вирусного Shorts на тему: ${topic}. Тон: ${tone}. 
      Структура:
      1. Заголовок (крючок)
      2. Сценарий (3-5 кадров с описанием действий и текста)
      3. Описание и 5 тегов.`;
    } else if (platform === 'YouTube') {
      prompt = `Создай план для вирусного видео на YouTube. Тема: ${topic}. Тон: ${tone}.
      Включи:
      1. Кликабельный заголовок (3 варианта)
      2. Структура видео (вступление, основные пункты, финал)
      3. Описание для видео с ключевыми словами.`;
    } else if (platform === 'VK Клипы') {
      prompt = `Ты эксперт по VK Клипам. Создай сценарий для вирусного клипа на тему: ${topic}. Тон: ${tone}.
      Важно: Сделай акцент на динамичном начале (первые 2 секунды).
      Структура:
      1. Текст на экране в начале
      2. Описание действий и речи
      3. Список из 5 целевых хештегов для VK.`;
    } else if (platform === 'VK Видео') {
      prompt = `Ты эксперт по продвижению в VK Видео. Создай структуру для видео на тему: ${topic}. Тон: ${tone}.
      Включи:
      1. Название, оптимизированное под поиск VK
      2. Таймкоды (план видео)
      3. Описание для поста с видео.`;
    }

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