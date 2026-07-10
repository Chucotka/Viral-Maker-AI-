/**
 * Браузерные посетители /app/ без hash → на лендинг (Telegram Mini App не трогаем).
 */
(function landingGuard(global) {
  try {
    if (global.sessionStorage.getItem('vm_landing_ok') === '1') return;
    if (/[?&]skip_landing=1(?:&|$)/.test(global.location.search || '')) return;
    const hash = String(global.location.hash || '').replace(/^#\/?/, '').trim();
    if (hash) return;
    if (global.VMTelegramBoot?.hasInitData?.()) return;
    if (global.VMTelegramBoot?.isInsideTelegramClient?.()) return;
    const path = String(global.location.pathname || '').replace(/\/$/, '');
    if (path !== '/app' && path !== '') return;
    const qs = global.location.search || '';
    const join = qs ? `${qs}&` : '?';
    global.location.replace(`/app/landing.html${join}from=app`);
  } catch {
    /* ignore */
  }
})(window);
