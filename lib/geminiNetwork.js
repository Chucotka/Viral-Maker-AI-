const dns = require('dns');

/** Настройка сети для Gemini: IPv6-first + опциональный HTTP(S)-прокси. Вызывать при старте процесса. */
function configureGeminiNetwork() {
  try {
    dns.setDefaultResultOrder('ipv6first');
  } catch {
    /* ignore */
  }

  const proxy =
    String(process.env.GEMINI_HTTPS_PROXY || '').trim() ||
    String(process.env.HTTPS_PROXY || '').trim() ||
    String(process.env.GEMINI_PROXY || '').trim();
  if (!proxy) return;

  try {
    const { setGlobalDispatcher, ProxyAgent } = require('undici');
    setGlobalDispatcher(new ProxyAgent(proxy));
    console.log('[gemini] outbound proxy enabled');
  } catch (e) {
    console.error('[gemini] proxy setup failed:', e.message);
  }
}

function relayBaseUrl() {
  return String(process.env.GEMINI_RELAY_URL || '').trim().replace(/\/$/, '');
}

function relaySecret() {
  return String(process.env.GEMINI_RELAY_SECRET || '').trim();
}

function usesRelay() {
  return Boolean(relayBaseUrl() && relaySecret());
}

/** Базовый URL REST API Gemini или relay. */
function getGeminiApiBase() {
  const relay = relayBaseUrl();
  if (relay) return relay;
  return 'https://generativelanguage.googleapis.com';
}

/** Заголовки для прямого вызова или relay. */
function buildGeminiHeaders(apiKey) {
  const headers = { 'Content-Type': 'application/json' };
  const secret = relaySecret();
  if (usesRelay()) {
    headers['X-Relay-Secret'] = secret;
    return headers;
  }
  headers['x-goog-api-key'] = apiKey;
  return headers;
}

/** requestOptions для @google/generative-ai SDK. */
function getGeminiSdkRequestOptions() {
  const relay = relayBaseUrl();
  if (!relay) return {};
  return { baseUrl: relay };
}

function createGenerativeAI(apiKey) {
  const { GoogleGenerativeAI } = require('@google/generative-ai');
  return new GoogleGenerativeAI(apiKey);
}

module.exports = {
  configureGeminiNetwork,
  getGeminiApiBase,
  buildGeminiHeaders,
  getGeminiSdkRequestOptions,
  createGenerativeAI,
  usesRelay,
};
