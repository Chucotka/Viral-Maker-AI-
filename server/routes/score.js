const express = require('express');
const { calculateViralScore } = require('../services/viralScore');

const router = express.Router();

router.post('/', (req, res) => {
  try {
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    const score = calculateViralScore(text);

    // Simple tips generation based on missing elements
    const tips = [];
    if (!text.toLowerCase().includes('ai') && !text.toLowerCase().includes('крипта') && !text.toLowerCase().includes('нейросеть')) {
        tips.push('Добавь трендовые слова (например: AI, нейросеть, крипта)');
    }
    if (!text.includes('?')) {
        tips.push('Добавь вопрос в конце для вовлечения');
    }
    const emojiCount = (text.match(/[\u{1F600}-\u{1F64F}|\u{1F300}-\u{1F5FF}]/gu) || []).length;
    if (emojiCount < 3) {
        tips.push('Используй больше эмодзи (3-5 шт)');
    }
    if (!text.includes('подписывайся') && !text.includes('лайк') && !text.includes('репост')) {
        tips.push('Добавь призыв к действию (CTA)');
    }

    res.json({ score, tips });
  } catch (error) {
    console.error('Error in /api/score:', error);
    res.status(500).json({ error: 'Failed to score text' });
  }
});

module.exports = router;
