module.exports = (req, res) => {
  try {
    const fs = require('fs');
    const usersPath = '/tmp/users.json';
    let users = {};
    
    if (fs.existsSync(usersPath)) {
      try {
        users = JSON.parse(fs.readFileSync(usersPath, 'utf8'));
      } catch(e) {
        console.error('Error parsing users.json:', e);
      }
    }

    // Vercel handles query parsing automatically, req.query is already an object
    const userId = req.query.userId || req.query.id || 'anonymous';
    const user = users[userId] || { plan: 'free', dailyCount: 0 };
    
    res.json(user);
  } catch(e) {
    console.error('User API error:', e.message);
    res.json({ plan: 'free', dailyCount: 0 });
  }
};
