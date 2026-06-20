/**
 * Вход через Telegram для веб-версии (app.innoko.ru/app).
 * iframe через /tg-oauth/ — обход блокировки oauth.telegram.org в РФ.
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
    mountLoginUi();
  }

  function hideOverlay() {
    const el = overlay();
    if (el) el.classList.add('hidden');
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

  async function fetchAuthConfig() {
    const res = await global.VMRuntime.apiFetch('/api/auth/config');
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.callbackUrl) {
      throw new Error(data.message || 'Не удалось загрузить настройки входа');
    }
    return data;
  }

  function createRedirectButton(cfg, label) {
    const btn = document.createElement('a');
    btn.className = 'web-auth-login-btn web-auth-login-btn-primary';
    btn.href = cfg.proxiedLoginUrl || cfg.loginUrl;
    btn.textContent = label || 'Войти через Telegram';
    return btn;
  }

  function mountProxiedEmbed(cfg) {
    const box = document.createElement('div');
    box.className = 'web-auth-widget-embed';

    const embedUrl = cfg.proxiedEmbedUrl || cfg.embedUrl;
    if (!embedUrl) {
      box.appendChild(createRedirectButton(cfg));
      return box;
    }

    const iframe = document.createElement('iframe');
    iframe.setAttribute('title', 'Войти через Telegram');
    iframe.setAttribute('allowtransparency', 'true');
    iframe.setAttribute('scrolling', 'no');
    iframe.width = '238';
    iframe.height = '40';
    iframe.style.border = 'none';
    iframe.style.overflow = 'hidden';
    iframe.src = embedUrl;

    const allowedOrigins = new Set([global.location.origin]);
    try {
      allowedOrigins.add(new URL(embedUrl, global.location.href).origin);
    } catch {
      /* ignore */
    }

    let authed = false;
    function onMessage(event) {
      if (event.source !== iframe.contentWindow) return;
      if (!allowedOrigins.has(event.origin)) return;
      let data;
      try {
        data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
      } catch {
        return;
      }
      if (!data || typeof data !== 'object') return;
      if (data.event === 'resize') {
        if (data.height) iframe.height = String(data.height);
        if (data.width) iframe.width = String(data.width);
        return;
      }
      if (data.event === 'auth_user' && data.auth_data && !data.init) {
        authed = true;
        global.removeEventListener('message', onMessage);
        global.onTelegramWebLogin(data.auth_data);
      }
    }
    global.addEventListener('message', onMessage);

    box.appendChild(iframe);

    global.setTimeout(() => {
      if (authed) return;
      try {
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (doc && doc.body && doc.body.childElementCount === 0) {
          box.classList.add('web-auth-widget-failed');
        }
      } catch {
        /* cross-origin until proxy loads — ignore */
      }
    }, 8000);

    return box;
  }

  async function mountLoginUi() {
    const host = widgetHost();
    if (!host || host.dataset.mounted === '1') return;
    host.dataset.mounted = '1';
    host.innerHTML = '<p class="web-auth-loading">Загрузка…</p>';

    try {
      const cfg = await fetchAuthConfig();
      host.innerHTML = '';

      host.appendChild(mountProxiedEmbed(cfg));

      const redirectBtn = createRedirectButton(cfg, 'Войти через Telegram (если кнопка не видна)');
      redirectBtn.className = 'web-auth-login-btn web-auth-login-btn-secondary';
      host.appendChild(redirectBtn);

      const tgLink = document.createElement('a');
      tgLink.className = 'web-auth-login-btn web-auth-login-btn-secondary';
      tgLink.href = cfg.telegramBotUrl || 'https://t.me/viral_maker_ai_bot';
      tgLink.textContent = 'Или откройте бот в Telegram';
      host.appendChild(tgLink);

      const hint = document.createElement('p');
      hint.className = 'web-auth-alt';
      hint.textContent = 'Вход идёт через app.innoko.ru — без прямого доступа к заблокированному oauth.telegram.org';
      host.appendChild(hint);
    } catch (e) {
      host.innerHTML = '';
      const err = document.createElement('p');
      err.className = 'web-auth-alt';
      err.textContent = e.message || 'Ошибка настройки входа';
      host.appendChild(err);

      const fallback = document.createElement('a');
      fallback.className = 'web-auth-login-btn web-auth-login-btn-primary';
      fallback.href = 'https://t.me/viral_maker_ai_bot';
      fallback.textContent = 'Открыть бот в Telegram';
      host.appendChild(fallback);
    }
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

  function displayName(user) {
    if (!user || typeof user !== 'object') return '';
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
        await loginWithWidget(hashUser);
        return true;
      } catch (e) {
        global.VMRuntime?.alert(e.message || 'Не удалось войти');
      }
    }

    const sessionRes = await global.VMRuntime.apiFetch('/api/auth/session');
    const session = await sessionRes.json().catch(() => ({}));
    if (session.authenticated) {
      if (session.user) applyUserToUi(session.user);
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
