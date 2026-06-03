/**
 * Onboarding — первый запуск Mini App (3 шага).
 */
(function initOnboarding(global) {
  const tg = global.Telegram?.WebApp;
  const STORAGE_KEY = 'vm_onboarding_v1_done';

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

  const STEPS = [
    {
      title: 'Добро пожаловать в Viral Maker AI ⚡',
      body: 'Создавай вирусные тексты, сценарии и картинки за минуту. Начни с одной идеи — AI усилит её сам.',
      cta: 'Дальше',
    },
    {
      title: 'Заполни профиль автора',
      body: 'В настройках укажи нишу и стиль — генерации станут точнее и «ваши».',
      cta: 'Понятно',
    },
    {
      title: '5 бесплатных генераций в день',
      body: 'Приглашай друзей — получай бонусные генерации и дни Pro. Первая генерация в студии займёт 30 секунд.',
      cta: 'Поехали! 🚀',
    },
  ];

  let stepIndex = 0;

  function renderStep() {
    const step = STEPS[stepIndex];
    const title = qs('onboarding-title');
    const body = qs('onboarding-body');
    const btn = qs('onboarding-next');
    const dots = qs('onboarding-dots');
    if (!step || !title || !body || !btn) return;
    title.textContent = step.title;
    body.textContent = step.body;
    btn.textContent = step.cta;
    if (dots) {
      dots.innerHTML = STEPS.map(
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

  function next() {
    if (stepIndex >= STEPS.length - 1) {
      markDone();
      hide();
      if (typeof global.switchTab === 'function') global.switchTab('studio');
      tg?.HapticFeedback?.impactOccurred?.('light');
      return;
    }
    stepIndex += 1;
    renderStep();
  }

  function skip() {
    markDone();
    hide();
  }

  function mount() {
    qs('onboarding-next')?.addEventListener('click', next);
    qs('onboarding-skip')?.addEventListener('click', skip);
  }

  global.VMOnboarding = { mount, show, markDone, isDone };
})(window);
