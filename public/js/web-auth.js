/**
 * Вход через Telegram Login Widget для веб-версии (innoko.ru/app).
 */
(function initWebAuth(global) {
  const overlay = () => document.getElementById('web-auth-overlay');
  const widgetHost = () => document.getElementById('web-auth-widget');

  function botUsername() {
    const meta = document.querySelector('meta[name="vm-bot-username"]');
    const fromMeta = meta?.getAttribute('content')?.trim().replace(/^@+/, '');
    if (fromMeta) return fromMeta;
    return 'viral_maker_ai_bot';
  }

  function showOverlay() {
    const el = overlay();
    if (el) el.classList.remove('hidden');
    mountWidget();
  }

  function hideOverlay() {
    const el = overlay();
    if (el) el.classList.add('hidden');
  }

  function authCallbackUrl() {
    return `${global.location.origin}/api/auth/telegram-callback`;
  }

  function showAuthErrorFromUrl() {
    try {
      const err = new URL(global.location.href).searchParams.get('auth_error');
      if (!err) return;
      const messages = {
        invalid: 'Не удалось подтвердить вход через Telegram. Попробуйте снова.',
        session: 'На сервере не настроен SESSION_SECRET. Обратитесь к администратору.',
        server: 'Сервер не настроен (нет токена бота).',
      };
      global.VMRuntime?.alert(messages[err] || 'Ошибка входа');
      const u = new URL(global.location.href);
      u.searchParams.delete('auth_error');
      global.history.replaceState({}, '', u.pathname + u.search);
    } catch {
      /* ignore */
    }
  }

  function mountWidget() {
    const host = widgetHost();
    if (!host || host.dataset.mounted === '1') return;
    host.dataset.mounted = '1';
    host.innerHTML = '';

    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.setAttribute('data-telegram-login', botUsername());
    script.setAttribute('data-size', 'large');
    script.setAttribute('data-request-access', 'write');
    script.setAttribute('data-auth-url', authCallbackUrl());
    host.appendChild(script);
  }

  async function loginWithWidget(user) {
    const startParam = global.VMRuntime?.readStartParamFromUrl?.() || '';
    const res = await global.VMRuntime.apiFetch('/api/auth/telegram-login', {
      method: 'POST',
      body: JSON.stringify({
        telegramUser: user,
        startParam: startParam || undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.message || data.error || 'Ошибка входа');
    }
    if (data.user) applyUserToUi(data.user);
    hideOverlay();
    return data;
  }

  function applyUserToUi(user) {
    if (!user) return;
    const nameEl = document.getElementById('user-name');
    if (nameEl && user.first_name) nameEl.textContent = user.first_name;
    const avatar = document.getElementById('user-avatar');
    if (avatar && user.photo_url) {
      avatar.innerHTML = `<img src="${user.photo_url}" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover">`;
    }
    const settingsHeroAvatar = document.getElementById('settings-hero-avatar');
    if (settingsHeroAvatar && user.photo_url) {
      settingsHeroAvatar.innerHTML = `<img src="${user.photo_url}" alt="" class="settings-hero-avatar-img">`;
    }
  }

  async function ensureSession() {
    if (global.VMRuntime?.isTelegram) return true;

    showAuthErrorFromUrl();

    const sessionRes = await global.VMRuntime.apiFetch('/api/auth/session');
    const session = await sessionRes.json().catch(() => ({}));
    if (session.authenticated) {
      hideOverlay();
      return true;
    }

    showOverlay();
    return new Promise((resolve, reject) => {
      global.__vmWebAuthResolve = resolve;
      global.__vmWebAuthReject = reject;
    });
  }

  global.onTelegramWebLogin = async function onTelegramWebLogin(user) {
    try {
      await loginWithWidget(user);
      global.__vmWebAuthResolve?.(true);
    } catch (e) {
      global.VMRuntime?.alert(e.message || 'Не удалось войти');
      global.__vmWebAuthReject?.(e);
    } finally {
      delete global.__vmWebAuthResolve;
      delete global.__vmWebAuthReject;
    }
  };

  global.VMWebAuth = {
    ensureSession,
    showOverlay,
    hideOverlay,
    applyUserToUi,
  };
})(window);
