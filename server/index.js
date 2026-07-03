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

/** SPA на корне: innoko.ru/#/dashboard (как levsha.studio) */
app.use(express.static(publicDir, { index: 'index.html' }));

/** Legacy URL → hash-роут */
app.get(['/app', '/app/'], (req, res) => {
  res.redirect(301, '/#/dashboard');
});

mountApiRoutes(app);

/** Совместимость: Manus/legacy путь → тот же callback, что /api/auth/telegram-callback */
app.get('/auth/telegram/callback', require('../api/auth-telegram-callback'));

/** Health check */
app.get('/api/ping', (req, res) => res.send('pong'));

module.exports = app;
