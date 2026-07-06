/**
 * Синхронный bootstrap Telegram Mini App до defer-скриптов.
 * Никогда не затирает window.Telegram, если клиент уже инжектил WebApp.
 */
(function initTelegramBoot(global) {
  function getWebApp() {
    return global.Telegram?.WebApp || null;
  }

  function hasInitData() {
    return Boolean(String(getWebApp()?.initData || '').trim());
  }

  function isInsideTelegramClient() {
    return /Telegram/i.test(String(global.navigator?.userAgent || ''));
  }

  function hasTgWebAppHint() {
    try {
      return /tgWebApp/i.test(String(global.location.href || ''));
    } catch {
      return false;
    }
  }

  function shouldLoadTelegramSdk() {
    if (hasInitData()) return false;
    if (getWebApp() && hasInitData()) return false;
    return isInsideTelegramClient() || hasTgWebAppHint() || Boolean(getWebApp());
  }

  function installBrowserStub() {
    if (getWebApp()) return;
    global.Telegram = {
      WebApp: {
        initData: '',
        ready: function ready() {},
        expand: function expand() {},
      },
    };
  }

  function markMiniApp() {
    global.document?.documentElement?.classList?.add('vm-telegram-mini-app');
    const overlay = global.document?.getElementById('web-auth-overlay');
    if (overlay) overlay.classList.add('hidden');
  }

  if (hasInitData()) {
    markMiniApp();
  } else if (!shouldLoadTelegramSdk()) {
    installBrowserStub();
  } else {
    global.document.write('<script src="js/telegram-web-app.js"><\/script>');
  }

  function waitForInitData(timeoutMs = 8000) {
    return new Promise((resolve) => {
      if (hasInitData()) {
        markMiniApp();
        resolve(getWebApp()?.initData || '');
        return;
      }
      const started = Date.now();
      const tick = () => {
        if (hasInitData()) {
          markMiniApp();
          resolve(getWebApp()?.initData || '');
          return;
        }
        if (Date.now() - started >= timeoutMs) {
          resolve('');
          return;
        }
        global.setTimeout(tick, 30);
      };
      tick();
    });
  }

  global.VMTelegramBoot = {
    waitForInitData,
    hasInitData,
    isInsideTelegramClient,
    markMiniApp,
  };
})(window);
