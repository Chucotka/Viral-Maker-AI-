/**
 * Hash-роутинг как на levsha.studio/#/dashboard
 * Маршруты: #/dashboard, #/studio, #/trends, #/analytics, #/settings
 */
(function initVmRouter(global) {
  const TABS = ['dashboard', 'studio', 'trends', 'analytics', 'settings'];
  const DEFAULT_TAB = 'dashboard';

  function parseHash() {
    const raw = String(global.location.hash || '').replace(/^#\/?/, '').trim();
    if (!raw) return DEFAULT_TAB;
    const tab = raw.split(/[/?#]/)[0].toLowerCase();
    return TABS.includes(tab) ? tab : DEFAULT_TAB;
  }

  function hashForTab(tabId) {
    if (!TABS.includes(tabId)) return `#/${DEFAULT_TAB}`;
    return `#/${tabId}`;
  }

  function syncHash(tabId, replace = true) {
    if (global.VMRuntime?.isTelegram) return;
    const nextHash = hashForTab(tabId);
    const path = global.location.pathname || '/';
    const onApp = path.startsWith('/app');
    if (!onApp && !global.location.hash) return;
    if (global.location.hash === nextHash) return;
    const u = new URL(global.location.href);
    const nextUrl = `${u.pathname}${u.search}${nextHash}`;
    if (replace) {
      global.history.replaceState(null, '', nextUrl);
    } else {
      global.location.hash = nextHash;
    }
  }

  function applyFromHash() {
    const tab = parseHash();
    if (typeof global.switchTab === 'function') {
      global.switchTab(tab);
    }
    return tab;
  }

  function install(switchTabFn) {
    if (typeof switchTabFn !== 'function') return;

    global.addEventListener('hashchange', () => {
      applyFromHash();
    });

    const original = switchTabFn;
    global.switchTab = function wrappedSwitchTab(tabId) {
      original(tabId);
      syncHash(tabId);
    };

    if (global.location.hash) {
      applyFromHash();
    }
  }

  global.VMRouter = {
    TABS,
    DEFAULT_TAB,
    parseHash,
    hashForTab,
    syncHash,
    applyFromHash,
    install,
  };

  if (typeof global.switchTab === 'function') {
    install(global.switchTab);
  }
})(window);
