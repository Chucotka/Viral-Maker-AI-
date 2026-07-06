const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const app = require('../server/index.js');

function request(path) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      http.get(`http://127.0.0.1:${port}${path}`, (res) => {
        res.resume();
        server.close(() => resolve({ status: res.statusCode, location: res.headers.location }));
      }).on('error', (e) => {
        server.close(() => reject(e));
      });
    });
  });
}

describe('web app route /app', () => {
  it('/app redirects once to /app/', async () => {
    const res = await request('/app');
    assert.equal(res.status, 301);
    assert.equal(res.location, '/app/');
  });

  it('/app/ serves HTML without redirect loop', async () => {
    const res = await request('/app/');
    assert.equal(res.status, 200);
  });
});
