module.exports = (req, res) => {
  res.json({ trends: [
    { name: 'Искусственный интеллект', score: 95, emoji: '🤖' },
    { name: 'Крипта', score: 88, emoji: '₿' },
    { name: 'Продуктивность', score: 82, emoji: '⚡️' },
    { name: 'Финансы', score: 79, emoji: '💰' },
    { name: 'Лайфстайл', score: 74, emoji: '✨' },
    { name: 'Здоровье', score: 71, emoji: '💪' }
  ]});
};