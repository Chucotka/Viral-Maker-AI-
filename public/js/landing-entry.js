/**
 * Лендинг Product Radar: согласие с legal и переход в приложение.
 */
(function initLandingEntry(global) {
  const consent = global.document?.getElementById('landing-consent');
  const enterBtn = global.document?.getElementById('landing-enter');
  if (!consent || !enterBtn) return;

  function updateBtn() {
    enterBtn.disabled = !consent.checked;
  }

  consent.addEventListener('change', updateBtn);
  updateBtn();

  enterBtn.addEventListener('click', () => {
    if (!consent.checked) return;
    try {
      global.sessionStorage.setItem('vm_landing_ok', '1');
    } catch {
      /* ignore */
    }
    const params = new URLSearchParams(global.location.search);
    if (!params.get('utm_source')) params.set('utm_source', 'landing');
    params.set('utm_medium', 'cta');
    const appUrl = `/app/?${params.toString()}#/dashboard`;
    global.location.href = appUrl;
  });
})(window);
