const express = require('express');
const { generateContent } = require('../services/openai');
const { calculateViralScore } = require('../services/viralScore');
const { savePost, getPosts } = require('../services/db');

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { topic, platform, tone } = req.body;

    if (!topic || !platform || !tone) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const content = await generateContent({ topic, platform, tone });
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
