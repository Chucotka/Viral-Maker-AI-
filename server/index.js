/**
 * Express dev-сервер для локальной разработки.
 * Все API-маршруты монтируются из api/*.js (тот же код, что на Vercel).
 */
const express = require('express');
const path = require('path');
const { mountApiRoutes } = require('./mountApi');

const app = express();

app.set('trust proxy', 1);

app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = Buffer.from(buf);
    },
  }),
);

const publicDir = path.join(__dirname, '../public');

/** Корень — Telegram Mini App и legacy URL. */
app.use(express.static(publicDir));

/** Веб-версия на innoko.ru/app */
app.get('/app', (req, res) => res.redirect(301, '/app/'));
app.use('/app', express.static(publicDir, { index: 'index.html' }));

mountApiRoutes(app);

/** Dev-only health check (на Vercel используйте /api/webhook GET). */
app.get('/api/ping', (req, res) => res.send('pong'));

module.exports = app;
