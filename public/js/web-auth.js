/**
 * Веб-сессия: автоматический гостевой вход без Telegram.
 * Привязка Telegram — опционально (для синхронизации с мини-приложением).
 */
(function initWebAuth(global) {
  const overlay = () => document.getElementById('web-auth-overlay');
  const widgetHost = () => document.getElementById('web-auth-widget');

  function showOverlay() {
    const el = overlay();
    if (el) {
      el.classList.remove('hidden');
      el.setAttribute('aria-hidden', 'false');
    }
    mountTelegramLinkUi();
  }

  function hideOverlay() {
    const el = overlay();
    if (el) {
      el.classList.add('hidden');
      el.setAttribute('aria-hidden', 'true');
    }
  }

  function parseTgAuthResultFromHash() {
    try {
      const hash = String(global.location.hash || '');
      const re = /[#?&]tgAuthResult=([A-Za-z0-9\-_=]*)/;
      const match = hash.match(re);
      if (!match) return null;
      let data = match[1] || '';
      data = data.replace(/-/g, '+').replace(/_/g, '/');
      const pad = data.length % 4;
      if (pad > 1) data += new Array(5 - pad).join('=');
      const user = JSON.parse(global.atob(data));
      const clean = new URL(global.location.href);
      clean.hash = '';
      global.history.replaceState({}, '', clean.pathname + clean.search);
      return user;
    } catch {
      return null;
    }
  }

  function showAuthErrorFromUrl() {
    try {
      const err = new URL(global.location.href).searchParams.get('auth_error');
      if (!err) return;
      const messages = {
        invalid: 'Не удалось привязать Telegram. Попробуйте снова.',
        session: 'На сервере не настроен SESSION_SECRET. Обратитесь к администратору.',
        server: 'Сервер не настроен (нет токена бота).',
      };
      global.VMRuntime?.alert(messages[err] || 'Ошибка привязки');
      const u = new URL(global.location.href);
      u.searchParams.delete('auth_error');
      global.history.replaceState({}, '', u.pathname + u.search);
    } catch {
      /* ignore */
    }
  }

  async function fetchAuthConfig() {
    const res = await global.VMRuntime.apiFetch('/api/auth/config');
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.callbackUrl) {
      throw new Error(data.message || 'Не удалось загрузить настройки');
    }
    return data;
  }

  function createTelegramLinkButton(cfg, label) {
    const btn = document.createElement('a');
    btn.className = 'web-auth-login-btn web-auth-login-btn-primary web-auth-login-btn-telegram';
    btn.href = cfg.proxiedLoginUrl || cfg.loginUrl;
    btn.innerHTML = `<span class="web-auth-tg-icon" aria-hidden="true"></span>${label || 'Привязать Telegram'}`;
    return btn;
  }

  async function mountTelegramLinkUi() {
    const host = widgetHost();
    if (!host) return;
    host.dataset.mounted = '0';
    host.innerHTML = '<p class="web-auth-loading">Загрузка…</p>';

    try {
      const cfg = await fetchAuthConfig();
      host.innerHTML = '';
      host.appendChild(createTelegramLinkButton(cfg));

      const skip = document.createElement('button');
      skip.type = 'button';
      skip.className = 'web-auth-login-btn web-auth-login-btn-secondary';
      skip.textContent = 'Продолжить как гость';
      skip.addEventListener('click', hideOverlay);
      host.appendChild(skip);

      const hint = document.createElement('p');
      hint.className = 'web-auth-alt';
      hint.textContent = 'Без Telegram всё работает в браузере. Привязка нужна только для синхронизации с мини-приложением и оплаты через бота.';
      host.appendChild(hint);
      host.dataset.mounted = '1';
    } catch (e) {
      host.innerHTML = '';
      const err = document.createElement('p');
      err.className = 'web-auth-alt';
      err.textContent = e.message || 'Ошибка настройки';
      host.appendChild(err);
      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'web-auth-login-btn web-auth-login-btn-secondary';
      close.textContent = 'Закрыть';
      close.addEventListener('click', hideOverlay);
      host.appendChild(close);
    }
  }

  async function loginWithTelegram(user) {
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
      throw new Error(data.message || data.error || 'Ошибка привязки');
    }
    if (data.user) applyUserToUi(data.user);
    hideOverlay();
    return data;
  }

  function displayName(user) {
    if (!user || typeof user !== 'object') return '';
    if (user.is_guest) {
      const label = String(user.guest_label || '').trim();
      return label ? `Гость ${label}` : 'Гость';
    }
    return String(user.first_name || user.username || '').trim();
  }

  function applyUserToUi(user) {
    if (!user) return;
    const name = displayName(user) || 'Пользователь';
    const nameEl = document.getElementById('user-name');
    if (nameEl) nameEl.textContent = name;
    const settingsHeroName = document.getElementById('settings-hero-name');
    if (settingsHeroName) settingsHeroName.textContent = name;
    const avatar = document.getElementById('user-avatar');
    if (avatar && user.photo_url) {
      avatar.innerHTML = `<img src="${user.photo_url}" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover">`;
    } else if (avatar && user.is_guest) {
      avatar.textContent = '👤';
    }
    const settingsHeroAvatar = document.getElementById('settings-hero-avatar');
    if (settingsHeroAvatar && user.photo_url) {
      settingsHeroAvatar.innerHTML = `<img src="${user.photo_url}" alt="" class="settings-hero-avatar-img">`;
    }
  }

  async function ensureSession() {
    if (global.VMRuntime?.isTelegram) return true;

    showAuthErrorFromUrl();

    const hashUser = parseTgAuthResultFromHash();
    if (hashUser) {
      try {
        await loginWithTelegram(hashUser);
      } catch (e) {
        global.VMRuntime?.alert(e.message || 'Не удалось привязать Telegram');
      }
    }

    const sessionRes = await global.VMRuntime.apiFetch('/api/auth/session');
    const session = await sessionRes.json().catch(() => ({}));
    if (session.user) applyUserToUi(session.user);
    hideOverlay();
    global.__vmWebGuest = Boolean(session.isGuest);
    return true;
  }

  global.onTelegramWebLogin = async function onTelegramWebLogin(user) {
    try {
      await loginWithTelegram(user);
      global.__vmWebGuest = false;
      await global.loadUserData?.();
    } catch (e) {
      global.VMRuntime?.alert(e.message || 'Не удалось привязать Telegram');
    }
  };

  global.VMWebAuth = {
    ensureSession,
    showOverlay,
    hideOverlay,
    applyUserToUi,
    isGuest: () => Boolean(global.__vmWebGuest),
  };
})(window);
