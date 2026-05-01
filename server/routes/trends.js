const express = require('express');

const router = express.Router();

router.get('/', (req, res) => {
  // Hardcoded trends for MVP as requested in requirements
  const trends = [
    { name: 'AI', score: 95, emoji: '🤖' },
    { name: 'Крипта', score: 92, emoji: '💰' },
    { name: 'Нейросети для бизнеса', score: 88, emoji: '📈' },
    { name: 'ChatGPT советы', score: 85, emoji: '💡' },
    { name: 'Лайфстайл', score: 75, emoji: '✨' },
    { name: 'Финансы', score: 80, emoji: '💵' },
    { name: 'Успех', score: 70, emoji: '🏆' },
    { name: 'Web3', score: 82, emoji: '🌐' }
  ];

  res.json({ trends });
});

module.exports = router;
