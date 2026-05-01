const express = require('express');
const { getUserData } = require('../services/db');

const router = express.Router();

router.get('/', (req, res) => {
  try {
    const userId = req.query.userId || 'anonymous';
    const userData = getUserData(userId);
    res.json({ userData });
  } catch (error) {
    console.error('Error in /api/user:', error);
    res.status(500).json({ error: 'Failed to fetch user data' });
  }
});

module.exports = router;
