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

  app.get('/api/ping', (req, res) => res.send('pong'));

  app.post('/api/webhook', async (req, res) => {
    console.log('Webhook called:', JSON.stringify(req.body));
    res.sendStatus(200);
  });

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

  app.get('/api/test', (req, res) => res.json({ ok: true, env: !!process.env.TELEGRAM_BOT_TOKEN }));

  // Initialize Telegram Bot
  setupBot();
  const bot = getBot();

  // Fallback to index.html for SPA
  app.get(/^(?!\/api).+/, (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
  });

  if (app && app._router && app._router.stack) {
    app._router.stack.forEach(r => {
      if (r.route) console.log('Route:', r.route.path);
    });
  }
} catch (error) {
  console.error('Failed to initialize server:', error);
}

module.exports = app;
