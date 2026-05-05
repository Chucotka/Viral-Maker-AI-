const { getTrendsList } = require('../lib/trendsProvider');

module.exports = async (req, res) => {
  try {
    const trends = await getTrendsList();
    res.json({ trends });
  } catch (e) {
    console.error('trends:', e.message);
    res.status(500).json({ error: e.message });
  }
};
