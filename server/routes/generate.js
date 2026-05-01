const express = require('express');
const { generateContent } = require('../services/gemini');
const { calculateViralScore } = require('../services/viralScore');
const { savePost, getPosts, getUserData, incrementUserCount } = require('../services/db');

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { topic, platform, tone, model, userId } = req.body;

    if (!topic || !platform || !tone) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Rate Limiting Logic
    const user = userId || 'anonymous';
    const userData = getUserData(user);
    const LIMITS = { free: 5, pro: Infinity };
    const limit = LIMITS[userData.plan] || 5;

    if (userData.dailyCount >= limit) {
      return res.status(403).json({
        error: 'limit_reached',
        message: 'Лимит исчерпан на сегодня. Перейди на Pro для безлимитной генерации.'
      });
    }

    // Force model based on plan
    const finalModel = userData.plan === 'free' ? 'gemini-1.5-flash' : (model || 'gemini-1.5-pro');

    const content = await generateContent({ topic, platform, tone, model: finalModel });

    // Increment after successful generation
    incrementUserCount(user);
    const viralScore = calculateViralScore(content);

    const post = savePost({
      topic,
      platform,
      tone,
      content,
      viralScore
    });

    res.json({ content, viralScore, post });
  } catch (error) {
    console.error('Error in /api/generate:', error);
    res.status(500).json({ error: 'Failed to generate content' });
  }
});

// GET route to fetch dashboard/analytics history
router.get('/history', (req, res) => {
    try {
        const posts = getPosts();
        res.json({ posts });
    } catch (error) {
        console.error('Error fetching history:', error);
        res.status(500).json({ error: 'Failed to fetch history' });
    }
});

module.exports = router;
