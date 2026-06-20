/**
 * Cloudflare Worker: прокси Gemini API из региона, доступного Google.
 * Деплой: см. scripts/cloudflare-gemini-relay/README.md
 */
export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204 });
    }
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/([A-Za-z0-9_-]{16,128})(\/.*)$/);
    if (!match || match[1] !== env.RELAY_SECRET) {
      return new Response('Not found', { status: 404 });
    }
    const googleUrl = `https://generativelanguage.googleapis.com${match[2]}${url.search}`;
    const headers = new Headers(request.headers);
    headers.set('x-goog-api-key', env.GEMINI_API_KEY);
    headers.delete('host');
    return fetch(googleUrl, {
      method: request.method,
      headers,
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
    });
  },
};
