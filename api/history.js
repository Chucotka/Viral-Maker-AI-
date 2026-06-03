const { resolveTelegramUser } = require('../lib/miniAppAuth');
const { isKvConfigured } = require('../lib/kvUserStore');
const { getUserHistory, updateUserHistoryEntry } = require('../lib/kvHistory');
const { getLocalHistory } = require('../lib/localHistoryStore');
const { sendSafeError } = require('../lib/httpErrors');

module.exports = async (req, res) => {
  try {
    const auth = resolveTelegramUser(req, res);
    if (!auth) return;

    if (req.method === 'GET') {
      const items = isKvConfigured() ? await getUserHistory(auth.userId, 40) : await getLocalHistory(auth.userId, 40);
      return res.json({ items });
    }

    if (req.method === 'POST') {
      const ts = Number(req.body?.ts);
      const mutation = req.body?.mutation && typeof req.body.mutation === 'object' ? req.body.mutation : {};
      if (!Number.isFinite(ts)) {
        return res.status(400).json({ error: 'invalid_ts' });
      }
      if (!isKvConfigured()) {
        return res.status(503).json({ error: 'kv_required', message: 'History feedback requires Redis in this environment.' });
      }
      const item = await updateUserHistoryEntry(auth.userId, ts, mutation);
      if (!item) return res.status(404).json({ error: 'history_item_not_found' });
      return res.json({ ok: true, item });
    }

    return res.status(405).end();
  } catch (e) {
    sendSafeError(res, e, 'history');
  }
};
