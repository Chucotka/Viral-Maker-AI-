/** Статический fallback; переопределение — KV `vm:global:trends` или env `TRENDS_JSON`. */
const DEFAULT_TRENDS = [
  { name: 'Искусственный интеллект', score: 95, emoji: '🤖' },
  { name: 'Крипта', score: 88, emoji: '₿' },
  { name: 'Продуктивность', score: 82, emoji: '⚡️' },
  { name: 'Финансы', score: 79, emoji: '💰' },
  { name: 'Лайфстайл', score: 74, emoji: '✨' },
  { name: 'Здоровье', score: 71, emoji: '💪' },
];

module.exports = { DEFAULT_TRENDS };
