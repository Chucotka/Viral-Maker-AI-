/**
 * Монтирует API handlers (api/*.js) на Express-сервер.
 * Единый источник правды для dev и prod — устраняет drift server vs api.
 */

const { sendSafeError } = require('../lib/httpErrors');

/** path → { module, methods } */
const API_ROUTES = [
  { path: '/api/auth/config', module: '../api/auth-config', methods: ['get'] },
  { path: '/api/auth/telegram-login', module: '../api/auth-login', methods: ['post'] },
  { path: '/api/auth/telegram-callback', module: '../api/auth-telegram-callback', methods: ['get'] },
  { path: '/api/auth/logout', module: '../api/auth-logout', methods: ['post'] },
  { path: '/api/auth/session', module: '../api/auth-session', methods: ['get'] },
  { path: '/api/user', module: '../api/user', methods: ['get', 'post'] },
  { path: '/api/generate', module: '../api/generate', methods: ['post'] },
  { path: '/api/generate-image', module: '../api/generate-image', methods: ['post'] },
  { path: '/api/image-download', module: '../api/image-download', methods: ['get', 'post', 'options'] },
  { path: '/api/send-image-save', module: '../api/image-download', methods: ['post'] },
  { path: '/api/history', module: '../api/history', methods: ['get', 'post'] },
  { path: '/api/publish', module: '../api/publish', methods: ['post'] },
  { path: '/api/create-invoice', module: '../api/create-invoice', methods: ['get', 'post'] },
  { path: '/api/tribute-link', module: '../api/create-invoice', methods: ['get'] },
  { path: '/api/debug-plan', module: '../api/manual-plan', methods: ['post'] },
  { path: '/api/manual-plan', module: '../api/manual-plan', methods: ['get', 'post'] },
  { path: '/api/tribute-webhook', module: '../api/tribute-webhook', methods: ['post'] },
  { path: '/api/webhook', module: '../api/webhook', methods: ['get', 'post'] },
  { path: '/api/trends', module: '../api/trends', methods: ['get'] },
];

function wrapHandler(handlerFn, routePath) {
  return async (req, res, next) => {
    try {
      await handlerFn(req, res);
    } catch (err) {
      if (!res.headersSent) {
        sendSafeError(res, err, routePath);
      } else {
        next(err);
      }
    }
  };
}

function mountApiRoutes(app) {
  for (const route of API_ROUTES) {
    const handler = require(route.module);
    const wrapped = wrapHandler(handler, route.path);
    for (const method of route.methods) {
      app[method](route.path, wrapped);
    }
  }
}

module.exports = { mountApiRoutes, API_ROUTES };
