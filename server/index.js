/**
 * Express dev-сервер для локальной разработки.
 * Все API-маршруты монтируются из api/*.js (тот же код, что на Vercel).
 */
const express = require('express');
const path = require('path');
const { mountApiRoutes } = require('./mountApi');

const app = express();

app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = Buffer.from(buf);
    },
  }),
);

app.use(express.static(path.join(__dirname, '../public')));

mountApiRoutes(app);

/** Dev-only health check (на Vercel используйте /api/webhook GET). */
app.get('/api/ping', (req, res) => res.send('pong'));

module.exports = app;
