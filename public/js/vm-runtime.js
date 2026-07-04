/**
 * Среда выполнения: Telegram Mini App или веб (innoko.ru/#/dashboard).
 */
(function initVmRuntime(global) {
  const tg = global.Telegram?.WebApp;
  const hasInitData = Boolean(tg?.initData);

  const nativeFetch = global.fetch.bind(global);

  function apiPath(path) {
    const p = String(path || '');
    if (p.startsWith('http://') || p.startsWith('https://')) return p;
    const base = global.VM_API_BASE || '';
    return `${base}${p.startsWith('/') ? p : `/${p}`}`;
  }

  function headers(jsonBody = false) {
    const h = {};
    if (jsonBody) h['Content-Type'] = 'application/json';
    if (hasInitData) h['X-Telegram-Init-Data'] = tg.initData;
    return h;
  }

  async function apiFetch(path, options = {}) {
    const url = apiPath(path);
    const opts = {
      credentials: 'include',
      ...options,
      headers: { ...headers(Boolean(options.body)), ...(options.headers || {}) },
    };
    return nativeFetch(url, opts);
  }

  function shouldPatchApi(url) {
    const s = String(url || '');
    return s.startsWith('/api') || /^https?:\/\/[^/]+\/api\//.test(s);
  }

  global.fetch = function patchedFetch(input, init) {
    const url = typeof input === 'string' ? input : input?.url || '';
    if (shouldPatchApi(url)) return apiFetch(url, init || {});
    return nativeFetch(input, init);
  };

  function alert(message, title) {
    const text = String(message || '');
    if (hasInitData && tg?.showAlert) {
      tg.showAlert(text);
      return;
    }
    if (hasInitData && tg?.showPopup) {
      tg.showPopup({ title: title || 'Viral Maker AI', message: text });
      return;
    }
    global.alert(text);
  }

  function popup(opts) {
    if (tg?.showPopup) {
      tg.showPopup(opts);
      return;
    }
    alert(opts?.message || '', opts?.title);
  }

  function readStartParamFromUrl() {
    try {
      const u = new URL(global.location.href);
      return u.searchParams.get('startapp') || u.searchParams.get('start_param') || '';
    } catch {
      return '';
    }
  }

  if (hasInitData) {
    tg.expand?.();
    tg.ready?.();
  }

  global.VMRuntime = {
    isTelegram: hasInitData,
    isWeb: !hasInitData,
    tg,
    apiPath,
    headers,
    apiFetch,
    alert,
    popup,
    readStartParamFromUrl,
  };
})(window);
