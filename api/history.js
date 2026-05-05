const { resolveTelegramUser } = require('../lib/miniAppAuth');
const { isKvConfigured } = require('../lib/kvUserStore');
const { getUserHistory } = require('../lib/kvHistory');
const { getLocalHistory } = require('../lib/localHistoryStore');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).end();
  try {
    const auth = resolveTelegramUser(req, res);
    if (!auth) return;
    const items = isKvConfigured() ? await getUserHistory(auth.userId, 40) : await getLocalHistory(auth.userId, 40);
    res.json({ items });
  } catch (e) {
    console.error('History API error:', e.message);
    res.status(500).json({ error: e.message });
  }
};
