/**
 * Веб: гостевая сессия + «Войти» для привязки Telegram (без блокировки приложения).
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
    mountLoginUi();
  }

  function hideOverlay() {
    const el = overlay();
    if (el) {
      el.classList.add('hidden');
      el.setAttribute('aria-hidden', 'true');
    }
  }

  function showMergeNotice() {
    global.VMRuntime?.alert?.(
      'Ваши генерации и настройки сохранены в Telegram-аккаунте.',
      'Вход выполнен',
    );
  }

  function consumeQueryFlag(name) {
    try {
      const u = new URL(global.location.href);
      if (u.searchParams.get(name) !== '1') return false;
      u.searchParams.delete(name);
      const qs = u.searchParams.toString();
      global.history.replaceState({}, '', u.pathname + (qs ? `?${qs}` : '') + u.hash);
      return true;
    } catch {
      return false;
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
      clean.hash = clean.hash.replace(re, '').replace(/^#$/, '');
      global.history.replaceState({}, '', clean.pathname + clean.search + clean.hash);
      return user;
    } catch {
      return null;
    }
  }

  async function fetchAuthConfig() {
    const res = await global.VMRuntime.apiFetch('/api/auth/config');
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.callbackUrl) {
      throw new Error(data.message || 'Не удалось загрузить настройки входа');
    }
    return data;
  }

  async function mountLoginUi() {
    const host = widgetHost();
    if (!host) return;
    host.innerHTML = '<p class="web-auth-loading">Загрузка…</p>';

    try {
      const cfg = await fetchAuthConfig();
      host.innerHTML = '';

      const btn = document.createElement('a');
      btn.className = 'web-auth-login-btn web-auth-login-btn-primary web-auth-login-btn-telegram';
      btn.href = cfg.proxiedLoginUrl || cfg.loginUrl;
      btn.innerHTML = '<span class="web-auth-tg-icon" aria-hidden="true"></span>Войти через Telegram';
      host.appendChild(btn);

      const skip = document.createElement('button');
      skip.type = 'button';
      skip.className = 'web-auth-login-btn web-auth-login-btn-secondary';
      skip.textContent = 'Продолжить без входа';
      skip.addEventListener('click', hideOverlay);
      host.appendChild(skip);

      const hint = document.createElement('p');
      hint.className = 'web-auth-alt';
      hint.textContent = 'Генерации и настройки сохранятся в вашем Telegram-аккаунте.';
      host.appendChild(hint);
    } catch (e) {
      host.innerHTML = `<p class="web-auth-alt">${e.message || 'Ошибка'}</p>`;
    }
  }

  async function loginWithTelegram(user) {
    const res = await global.VMRuntime.apiFetch('/api/auth/telegram-login', {
      method: 'POST',
      body: JSON.stringify({ telegramUser: user }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || data.error || 'Ошибка входа');
    if (data.user) applyUserToUi(data.user, false);
    hideOverlay();
    global.__vmWebGuest = false;
    if (data.mergedGuest) showMergeNotice();
    await global.loadUserData?.();
    return data;
  }

  function isGuestUser(user) {
    return Boolean(user?.is_guest) || global.__vmWebGuest;
  }

  function hasTelegramName(user) {
    return Boolean(String(user?.first_name || user?.username || '').trim());
  }

  function bindLoginTrigger(el) {
    if (!el || el.dataset.loginBound === '1') return;
    el.dataset.loginBound = '1';
    el.classList.add('user-name-login');
    el.style.cursor = 'pointer';
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    el.addEventListener('click', () => showOverlay());
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        showOverlay();
      }
    });
  }

  function applyUserToUi(user, isGuestOverride) {
    const isGuest = isGuestOverride !== undefined ? isGuestOverride : isGuestUser(user);
    const nameEl = document.getElementById('user-name');
    const settingsHeroName = document.getElementById('settings-hero-name');

    if (isGuest || !hasTelegramName(user)) {
      if (nameEl) {
        nameEl.textContent = 'Войти';
        bindLoginTrigger(nameEl);
      }
      if (settingsHeroName) settingsHeroName.textContent = 'Гость';
      return;
    }

    const name = String(user.first_name || user.username || '').trim() || 'Пользователь';
    if (nameEl) {
      nameEl.textContent = name;
      nameEl.classList.remove('user-name-login');
      nameEl.style.cursor = '';
      delete nameEl.dataset.loginBound;
    }
    if (settingsHeroName) settingsHeroName.textContent = name;
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

    const hashUser = parseTgAuthResultFromHash();
    if (hashUser) {
      try {
        await loginWithTelegram(hashUser);
      } catch (e) {
        global.VMRuntime?.alert(e.message || 'Не удалось войти');
      }
    }

    if (consumeQueryFlag('guest_merged')) showMergeNotice();

    const sessionRes = await global.VMRuntime.apiFetch('/api/auth/session');
    const session = await sessionRes.json().catch(() => ({}));
    global.__vmWebGuest = Boolean(session.isGuest);
    applyUserToUi(session.user, session.isGuest);
    hideOverlay();
    return true;
  }

  global.onTelegramWebLogin = async function onTelegramWebLogin(user) {
    try {
      await loginWithTelegram(user);
      await global.loadUserData?.();
    } catch (e) {
      global.VMRuntime?.alert(e.message || 'Не удалось войти');
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
