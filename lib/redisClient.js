const { Redis } = require('@upstash/redis');

let cachedRedis = null;

function resolveRedisConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '';
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '';
  if (!url || !token) return null;
  return { url, token };
}

function isKvConfigured() {
  return !!resolveRedisConfig();
}

function getRedisClient() {
  if (cachedRedis) return cachedRedis;
  const config = resolveRedisConfig();
  if (!config) return null;
  cachedRedis = new Redis({
    url: config.url,
    token: config.token,
    enableTelemetry: false,
  });
  return cachedRedis;
}

module.exports = {
  getRedisClient,
  isKvConfigured,
};
