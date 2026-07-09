/**
 * Onboarding — первый запуск Mini App / веб.
 */
(function initOnboarding(global) {
  const tg = global.Telegram?.WebApp;
  const STORAGE_KEY = 'vm_onboarding_v1_done';

  const DEFAULT_STEPS = [
    {
      title: 'Вы в Viral Maker AI',
      body: 'Это студия для вирусных текстов, сценариев Reels/Shorts и картинок. На главной выберите тип контента — дальше опишите идею и нажмите «Сгенерировать».',
      cta: 'Понятно',
    },
    {
      title: 'Начнём с первой генерации',
      body: 'На Free — 5 бесплатных генераций. Заполните профиль в настройках — тексты станут точнее. Сейчас откроем студию.',
      cta: 'Открыть студию',
    },
  ];

  const WEB_GUEST_STEPS = [
    {
      title: 'Вы в Viral Maker AI',
      body: 'Создавайте тексты, сценарии и картинки в браузере. На главной — три кнопки быстрого старта, дальше всё в студии.',
      cta: 'Понятно',
    },
    {
      title: 'Войдите через Telegram',
      body: 'В браузере нажмите «Войти через Telegram» — будет 5 генераций и сохранение истории. Или продолжите как гость (3 генерации).',
      cta: 'Войти через Telegram',
      action: 'browser-login',
      skipLabel: 'Продолжить как гость',
      skipAction: 'next',
    },
    {
      title: 'Откроем студию',
      body: 'Выберите тип контента, опишите идею в пару слов — ИИ сделает остальное.',
      cta: 'Поехали',
    },
  ];

  function isWebGuestFlow() {
    if (global.Telegram?.WebApp?.initData || global.VMRuntime?.isTelegram) return false;
    return Boolean(global.VMRuntime?.isWeb && global.VMWebAuth?.isGuest?.());
  }

  function getSteps() {
    return isWebGuestFlow() ? WEB_GUEST_STEPS : DEFAULT_STEPS;
  }

  function isDone() {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  }

  function markDone() {
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      /* ignore */
    }
  }

  function qs(id) {
    return document.getElementById(id);
  }

  let stepIndex = 0;

  function renderStep() {
    const steps = getSteps();
    const step = steps[stepIndex];
    const title = qs('onboarding-title');
    const body = qs('onboarding-body');
    const btn = qs('onboarding-next');
    const skip = qs('onboarding-skip');
    const dots = qs('onboarding-dots');
    if (!step || !title || !body || !btn) return;
    title.textContent = step.title;
    body.textContent = step.body;
    btn.textContent = step.cta;
    if (skip) skip.textContent = step.skipLabel || 'Пропустить';
    if (dots) {
      dots.innerHTML = steps.map(
        (_, i) => `<span class="onboarding-dot${i === stepIndex ? ' active' : ''}"></span>`,
      ).join('');
    }
  }

  function hide() {
    const overlay = qs('onboarding-modal');
    if (overlay) overlay.classList.add('hidden');
  }

  function show() {
    if (isDone()) return;
    const overlay = qs('onboarding-modal');
    if (!overlay) return;
    stepIndex = 0;
    renderStep();
    overlay.classList.remove('hidden');
  }

  function finish() {
    markDone();
    hide();
    if (typeof global.switchTab === 'function') global.switchTab('studio');
    tg?.HapticFeedback?.impactOccurred?.('light');
  }

  function openProfilePanel() {
    markDone();
    hide();
    global.switchTab?.('settings');
    global.SettingsHub?.openPanel?.('profile');
  }

  async function openBrowserLogin() {
    try {
      const res = await global.fetch('/api/auth/config');
      const cfg = await res.json().catch(() => ({}));
      const url = cfg.proxiedLoginUrl || cfg.loginUrl;
      if (url) {
        global.location.href = url;
        return;
      }
    } catch {
      /* fallback */
    }
    global.VMWebAuth?.showOverlay?.();
  }

  function next() {
    const steps = getSteps();
    const step = steps[stepIndex];
    if (step?.action === 'telegram') {
      global.VMWebAuth?.openInTelegramApp?.();
      tg?.HapticFeedback?.impactOccurred?.('light');
      return;
    }
    if (step?.action === 'browser-login') {
      openBrowserLogin();
      tg?.HapticFeedback?.impactOccurred?.('light');
      return;
    }
    if (step?.action === 'profile') {
      openProfilePanel();
      return;
    }
    if (stepIndex >= steps.length - 1) {
      finish();
      return;
    }
    stepIndex += 1;
    renderStep();
  }

  function skip() {
    const steps = getSteps();
    const step = steps[stepIndex];
    if (step?.skipAction === 'next' && stepIndex < steps.length - 1) {
      stepIndex += 1;
      renderStep();
      return;
    }
    finish();
  }

  function mount() {
    qs('onboarding-next')?.addEventListener('click', next);
    qs('onboarding-skip')?.addEventListener('click', skip);
  }

  global.VMOnboarding = { mount, show, markDone, isDone };
})(window);
