/** Эвристика viral score (как в server/index.js). */
function computeViralScore(content) {
  let score = 30;
  const trendKeywords = ['ai', 'нейросеть', 'chatgpt', 'будущее', 'bitcoin', 'крипта', 'деньги', 'успех'];
  trendKeywords.forEach((k) => {
    if (content.toLowerCase().includes(k)) score += 20;
  });
  const emotionalWords = ['вау', 'безумно', 'шок', 'невероятно', 'топ'];
  emotionalWords.forEach((w) => {
    if (content.toLowerCase().includes(w)) score += 15;
  });
  const emojiCount = (content.match(/[\u{1F600}-\u{1F64F}|\u{1F300}-\u{1F5FF}]/gu) || []).length;
  score += Math.min(emojiCount * 10, 30);
  if (content.includes('?')) score += 25;
  if (content.includes('подписывайся') || content.includes('лайк') || content.includes('репост')) score += 20;
  return Math.min(score, 100);
}

module.exports = { computeViralScore };
