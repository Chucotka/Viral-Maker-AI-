module.exports = (req, res) => {
  try {
    const fs = require('fs');
    let users = {};
    try { users = JSON.parse(fs.readFileSync('/tmp/users.json', 'utf8')); } catch(e) {}

    // In Vercel serverless functions, query params are parsed automatically
    const userId = req.query.userId || req.query.id || 'anonymous';
    const user = users[userId] || { plan: 'free', dailyCount: 0 };
    res.json(user);
  } catch(e) {
    res.json({ plan: 'free', dailyCount: 0 });
  }
};
