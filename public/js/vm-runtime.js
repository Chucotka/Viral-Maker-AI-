/**
 * Среда выполнения: Telegram Mini App или веб (innoko.ru/#/dashboard).
 */
(function initVmRuntime(global) {
  const nativeFetch =
    typeof global.fetch === 'function' ? global.fetch.bind(global) : null;

  function getWebApp() {
    return global.Telegram?.WebApp || null;
  }

  function hasInitData() {
    return Boolean(getWebApp()?.initData);
  }

  function syncTelegramChrome() {
    const tg = getWebApp();
    if (!tg?.initData) return;
    tg.expand?.();
    tg.ready?.();
    global.document?.documentElement?.classList?.add('vm-telegram-mini-app');
    const overlay = global.document?.getElementById('web-auth-overlay');
    if (overlay) overlay.classList.add('hidden');
  }

  function apiPath(path) {
    const p = String(path || '');
    if (p.startsWith('http://') || p.startsWith('https://')) return p;
    const base = global.VM_API_BASE || '';
    return `${base}${p.startsWith('/') ? p : `/${p}`}`;
  }

  function headers(jsonBody = false) {
    const h = {};
    if (jsonBody) h['Content-Type'] = 'application/json';
    const initData = getWebApp()?.initData;
    if (initData) h['X-Telegram-Init-Data'] = initData;
    return h;
  }

  async function apiFetch(path, options = {}) {
    if (!nativeFetch) {
      throw new Error('Браузер не поддерживает fetch');
    }
    syncTelegramChrome();
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

  if (nativeFetch) {
    global.fetch = function patchedFetch(input, init) {
      const url = typeof input === 'string' ? input : input?.url || '';
      if (shouldPatchApi(url)) return apiFetch(url, init || {});
      return nativeFetch(input, init);
    };
  }

  function alert(message, title) {
    const text = String(message || '');
    const tg = getWebApp();
    if (hasInitData() && tg?.showAlert) {
      tg.showAlert(text);
      return;
    }
    if (hasInitData() && tg?.showPopup) {
      tg.showPopup({ title: title || 'Viral Maker AI', message: text });
      return;
    }
    global.alert(text);
  }

  function popup(opts) {
    const tg = getWebApp();
    if (hasInitData() && tg?.showPopup) {
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

  syncTelegramChrome();

  const host = String(global.location?.hostname || '');
  if (host.includes('vercel.app') || host.includes('vercel.sh')) {
    global.alert(
      'Эта ссылка ведёт на старый Vercel (удалён).\n\nОткройте приложение здесь:\nhttps://app.innoko.ru/app/',
    );
    try {
      global.location.replace('https://app.innoko.ru/app/');
    } catch {
      /* ignore */
    }
  }

  global.VMRuntime = {
    get isTelegram() {
      return hasInitData();
    },
    get isWeb() {
      return !hasInitData();
    },
    get tg() {
      return getWebApp();
    },
    apiPath,
    headers,
    apiFetch,
    alert,
    popup,
    readStartParamFromUrl,
    syncTelegramChrome,
    hasInitData,
  };
})(window);
