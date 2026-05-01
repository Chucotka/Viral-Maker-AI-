process.on('uncaughtException', (err) => console.error('UNCAUGHT:', err));
process.on('unhandledRejection', (err) => console.error('UNHANDLED:', err));

let app;
try {
  require('dotenv').config();
  const express = require('express');
  const cors = require('cors');
  const path = require('path');
  const { setupBot, getBot } = require('./bot');

  const generateRoute = require('./routes/generate');
  const scoreRoute = require('./routes/score');
  const trendsRoute = require('./routes/trends');
  const publishRoute = require('./routes/publish');
  const userRoute = require('./routes/user');

  app = express();
  const PORT = process.env.PORT || 3000;

  app.get('/health', (req, res) => res.json({ status: 'ok' }));

  app.use(cors());
  app.use(express.json());

  // Serve static frontend files
  app.use(express.static(path.join(__dirname, '../public')));

  // API Routes
  app.use('/api/generate', generateRoute);
  app.use('/api/score', scoreRoute);
  app.use('/api/trends', trendsRoute);
  app.use('/api/publish', publishRoute);
  app.use('/api/user', userRoute);

  // Fallback to index.html for SPA
  app.get(/^(?!\/api).+/, (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
  });

  // Initialize Telegram Bot
  setupBot();
  const bot = getBot();

  // On Vercel, setup webhook
  if (bot) {
    const { webhookCallback } = require('grammy');
    app.use('/api/webhook', webhookCallback(bot, 'express'));
  }
} catch (error) {
  console.error('Failed to initialize server:', error);
}

module.exports = app;
