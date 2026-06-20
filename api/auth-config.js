module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).end();

  const token = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const botId = token.includes(':') ? token.split(':')[0] : '';
  const botUsername = String(process.env.TELEGRAM_BOT_USERNAME || 'viral_maker_ai_bot').replace(/^@+/, '');

  if (!botId) {
    return res.status(503).json({ error: 'server_misconfigured', message: 'Нет TELEGRAM_BOT_TOKEN.' });
  }

  return res.json({ botId, botUsername });
};
