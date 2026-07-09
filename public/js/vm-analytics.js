/**
 * Воронка продукта — лёгкие события в Redis через POST /api/events.
 */
(function initVmAnalytics(global) {
  const ALLOWED = new Set([
    'app_open',
    'studio_open',
    'guest_session',
    'telegram_session',
    'generation_completed',
    'limit_one_left',
    'paywall_shown',
    'checkout_click',
    'landing_go',
  ]);

  function track(stage, props) {
    const name = String(stage || '').trim();
    if (!ALLOWED.has(name)) return;
    const body = {
      stage: name,
      props: props && typeof props === 'object' ? props : {},
      ts: Date.now(),
    };
    const headers = { 'Content-Type': 'application/json' };
    const fetcher = global.VMRuntime?.apiFetch || global.fetch;
    if (!fetcher) return;
    fetcher('/api/events', {
      method: 'POST',
      credentials: 'include',
      headers,
      body: JSON.stringify(body),
    }).catch(() => {});
  }

  function readUtmSource() {
    try {
      const u = new URL(global.location.href);
      return u.searchParams.get('utm_source') || u.searchParams.get('startapp') || '';
    } catch {
      return '';
    }
  }

  global.VMAnalytics = {
    track,
    readUtmSource,
  };
})(window);
