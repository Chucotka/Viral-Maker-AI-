function calculateViralScore(text) {
  let score = 30; // base

  // +20 for trending keywords
  const trendKeywords = ['ai', 'нейросеть', 'chatgpt', 'будущее',
    'bitcoin', 'крипта', 'блокчейн', 'nft', 'деньги', 'успех'];
  trendKeywords.forEach(keyword => {
    if (text.toLowerCase().includes(keyword)) score += 20;
  });

  // +15 for emotional words
  const emotionalWords = ['вау', 'безумно', 'шок', 'невероятно', 'топ'];
  emotionalWords.forEach(word => {
    if (text.toLowerCase().includes(word)) score += 15;
  });

  // +10 for emojis (capped at 30)
  const emojiCount = (text.match(/[\u{1F600}-\u{1F64F}|\u{1F300}-\u{1F5FF}]/gu) || []).length;
  score += Math.min(emojiCount * 10, 30);

  // +25 for question mark
  if (text.includes('?')) score += 25;

  // +20 for CTA
  if (text.includes('подписывайся') || text.includes('лайк') || text.includes('репост')) {
    score += 20;
  }

  return Math.min(score, 100);
}

module.exports = { calculateViralScore };
