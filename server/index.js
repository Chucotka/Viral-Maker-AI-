/**
 * Express dev-сервер для локальной разработки.
 * Все API-маршруты монтируются из api/*.js (единый код для VPS и локальной разработки).
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
app.get('/app', (req, res, next) => {
  if (req.path !== '/app') return next();
  return res.redirect(301, '/app/');
});
app.use('/app', express.static(publicDir, { index: 'index.html' }));

mountApiRoutes(app);

/** Совместимость: Manus/legacy путь → тот же callback, что /api/auth/telegram-callback */
app.get('/auth/telegram/callback', require('../api/auth-telegram-callback'));

/** Dev-only health check (на проде: /api/ping). */
app.get('/api/ping', (req, res) => res.send('pong'));

module.exports = app;
