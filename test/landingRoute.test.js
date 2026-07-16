const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const fs = require('fs');
const path = require('path');
const app = require('../server/index.js');

function request(pathname) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      http.get(`http://127.0.0.1:${port}${pathname}`, (res) => {
        let body = '';
        res.on('data', (c) => {
          body += c;
        });
        res.on('end', () => {
          server.close(() =>
            resolve({ status: res.statusCode, location: res.headers.location, body }),
          );
        });
      }).on('error', (e) => {
        server.close(() => reject(e));
      });
    });
  });
}

describe('landing routes', () => {
  it('/app/landing redirects to landing.html', async () => {
    const res = await request('/app/landing');
    assert.equal(res.status, 301);
    assert.equal(res.location, '/app/landing.html');
  });

  it('/app/landing.html serves product page', async () => {
    const res = await request('/app/landing.html');
    assert.equal(res.status, 200);
    assert.match(res.body, /Viral Maker AI/);
    assert.match(res.body, /299 ₽/);
    assert.match(res.body, /политикой конфиденциальности/i);
  });

  it('landing.html exists on disk', () => {
    const fp = path.join(__dirname, '../public/landing.html');
    assert.ok(fs.existsSync(fp));
  });
});
