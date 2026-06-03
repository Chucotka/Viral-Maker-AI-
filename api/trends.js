const { getTrendsList } = require('../lib/trendsProvider');
const { sendSafeError } = require('../lib/httpErrors');

module.exports = async (req, res) => {
  try {
    const trends = await getTrendsList();
    res.json({ trends });
  } catch (e) {
    sendSafeError(res, e, 'trends');
  }
};
