require('dotenv').config({ quiet: true, override: true });
const { configureGeminiNetwork } = require('./lib/geminiNetwork');
configureGeminiNetwork();

const http = require('http');
const app = require('./server/index.js');

const DEFAULT_PORT = Number(process.env.PORT) || 3001;

function startServer(port) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.on('error', (err) => reject(err));
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

async function main() {
  let port = DEFAULT_PORT;
  let server;
  const portLocked = Boolean(process.env.PORT);
  const maxAttempts = portLocked ? 1 : 10;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      server = await startServer(port);
      break;
    } catch (err) {
      if (err.code === 'EADDRINUSE' && attempt < maxAttempts - 1) {
        port += 1;
        continue;
      }
      console.error('Failed to start dev server:', err.message);
      process.exit(1);
    }
  }

  const url = `http://127.0.0.1:${port}`;
  console.log(`Viral Maker AI dev server: ${url}`);
  console.log(`  static: ${url}/`);
  console.log(`  API:    ${url}/api/*`);

  const shutdown = () => {
    server.close(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
