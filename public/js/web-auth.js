/**
 * Веб: гостевая сессия + «Открыть в Telegram» (без OAuth в браузере).
 */
(function initWebAuth(global) {
  const overlay = () => document.getElementById('web-auth-overlay');
  const widgetHost = () => document.getElementById('web-auth-widget');

  function showOverlay() {
    if (isTelegramMiniApp()) return;
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

  function readStartParamFromUrl() {
    try {
      const u = new URL(global.location.href);
      const fromUrl = u.searchParams.get('startapp') || u.searchParams.get('start_param');
      if (fromUrl && String(fromUrl).trim()) return String(fromUrl).trim();
    } catch {
      /* ignore */
    }
    try {
      const stored = global.sessionStorage?.getItem('vm_start_param');
      if (stored && String(stored).trim()) return String(stored).trim();
    } catch {
      /* ignore */
    }
    if (global.ReferralSystem?.readStartParam) {
      const fromRef = global.ReferralSystem.readStartParam();
      if (fromRef) return fromRef;
    }
    return null;
  }

  function persistStartParam(startParam) {
    if (!startParam) return;
    try {
      global.sessionStorage?.setItem('vm_start_param', String(startParam));
    } catch {
      /* ignore */
    }
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

  function apiFetch(path, options = {}) {
    if (global.VMRuntime?.apiFetch) {
      return global.VMRuntime.apiFetch(path, options);
    }
    const headers = {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    };
    return global.fetch(path, {
      credentials: 'include',
      ...options,
      headers,
    });
  }

  function readBotUsername() {
    const fromMeta = global.document?.querySelector('meta[name="vm-bot-username"]')?.getAttribute('content');
    return String(fromMeta || 'viral_maker_ai_bot').replace(/^@+/, '');
  }

  function buildTelegramOpenUrl(startParam, botUsername) {
    const bot = String(botUsername || readBotUsername()).replace(/^@+/, '');
    const base = `https://t.me/${bot}/app`;
    if (startParam && String(startParam).trim()) {
      return `${base}?startapp=${encodeURIComponent(String(startParam).trim())}`;
    }
    return base;
  }

  function buildTgSchemeUrl(startParam, botUsername) {
    const bot = String(botUsername || readBotUsername()).replace(/^@+/, '');
    const sp = startParam && String(startParam).trim() ? String(startParam).trim() : 'open';
    return `tg://resolve?domain=${bot}&startapp=${encodeURIComponent(sp)}`;
  }

  function isMobileDevice() {
    return /Android|iPhone|iPad|iPod|Mobile/i.test(String(global.navigator?.userAgent || ''));
  }

  async function copyText(text) {
    const value = String(text || '');
    if (!value) return false;
    try {
      await global.navigator.clipboard.writeText(value);
      return true;
    } catch {
      /* fallback */
    }
    try {
      const ta = global.document.createElement('textarea');
      ta.value = value;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      global.document.body.appendChild(ta);
      ta.select();
      const ok = global.document.execCommand('copy');
      global.document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }

  function resolveTelegramOpenUrl(cfg) {
    const startParam = readStartParamFromUrl();
    const bot = String(cfg?.botUsername || readBotUsername()).replace(/^@+/, '');
    if (cfg?.telegramMiniAppUrl && !startParam) return cfg.telegramMiniAppUrl;
    return buildTelegramOpenUrl(startParam, bot);
  }

  function isInsideTelegramClient() {
    return /Telegram/i.test(String(global.navigator?.userAgent || ''));
  }

  function isTelegramMiniApp() {
    return Boolean(global.Telegram?.WebApp?.initData || global.VMRuntime?.isTelegram);
  }

  function openTelegramMiniAppSafely(startParam, botUsername) {
    const httpsUrl = buildTelegramOpenUrl(startParam, botUsername);
    const tg = global.Telegram?.WebApp;

    if (isTelegramMiniApp()) {
      hideOverlay();
      tg?.HapticFeedback?.impactOccurred?.('light');
      return true;
    }

    if (!isInsideTelegramClient()) return false;

    hideOverlay();
    if (typeof tg?.openTelegramLink === 'function') {
      tg.openTelegramLink(httpsUrl);
      return true;
    }

    void copyText(httpsUrl).then((ok) => {
      global.VMRuntime?.alert?.(
        ok
          ? 'Ссылка скопирована. В чате с ботом нажмите кнопку меню (☰) внизу → «Открыть приложение» / LAUNCH.'
          : httpsUrl,
        'Уже в Telegram',
      );
    });
    return true;
  }

  function navigateToTelegram(startParam, botUsername) {
    if (openTelegramMiniAppSafely(startParam, botUsername)) return;

    const httpsUrl = buildTelegramOpenUrl(startParam, botUsername);
    if (isMobileDevice()) {
      global.location.href = buildTgSchemeUrl(startParam, botUsername);
      global.setTimeout(() => {
        if (global.document?.visibilityState !== 'hidden') {
          global.open(httpsUrl, '_blank', 'noopener,noreferrer');
        }
      }, 900);
      return;
    }
    global.open(httpsUrl, '_blank', 'noopener,noreferrer');
  }

  async function fetchAuthConfig() {
    const res = await apiFetch('/api/auth/config');
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.botUsername) {
      throw new Error(data.message || 'Не удалось загрузить настройки входа');
    }
    return data;
  }

  function renderLoginButtons(host, openUrl, startParam) {
    host.innerHTML = '';

    if (isTelegramMiniApp()) {
      const note = global.document.createElement('p');
      note.className = 'web-auth-alt';
      note.textContent = 'Вы уже в Mini App Telegram. Закройте это окно и продолжайте работу.';
      host.appendChild(note);
      const closeBtn = global.document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'web-auth-login-btn web-auth-login-btn-primary';
      closeBtn.textContent = 'Продолжить';
      closeBtn.addEventListener('click', hideOverlay);
      host.appendChild(closeBtn);
      return;
    }

    const inTelegramBrowser = isInsideTelegramClient();
    const browserLoginBtn = global.document.createElement('button');
    browserLoginBtn.type = 'button';
    browserLoginBtn.className = 'web-auth-login-btn web-auth-login-btn-primary web-auth-login-btn-telegram';
    browserLoginBtn.innerHTML =
      '<span class="web-auth-tg-icon" aria-hidden="true"></span>Войти через Telegram в браузере';
    browserLoginBtn.addEventListener('click', async () => {
      try {
        const cfg = await fetchAuthConfig();
        const url = cfg.proxiedLoginUrl || cfg.loginUrl;
        if (!url) throw new Error('Не удалось получить ссылку входа');
        global.location.href = url;
      } catch (e) {
        global.VMRuntime?.alert?.(e.message || 'Не удалось открыть вход через Telegram');
      }
    });

    const btn = global.document.createElement('button');
    btn.type = 'button';
    btn.className = 'web-auth-login-btn web-auth-login-btn-secondary';
    btn.textContent = inTelegramBrowser
      ? 'Как открыть Mini App'
      : 'Открыть в приложении Telegram';
    btn.addEventListener('click', () => openTelegramMiniAppSafely(startParam));

    if (isMobileDevice() && !inTelegramBrowser) {
      host.appendChild(btn);
      host.appendChild(browserLoginBtn);
    } else if (inTelegramBrowser) {
      host.appendChild(browserLoginBtn);
      host.appendChild(btn);
    } else {
      host.appendChild(browserLoginBtn);
      host.appendChild(btn);
    }

    const copyBtn = global.document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'web-auth-login-btn web-auth-login-btn-secondary';
    copyBtn.textContent = 'Скопировать ссылку для Telegram';
    copyBtn.addEventListener('click', async () => {
      const ok = await copyText(openUrl);
      global.VMRuntime?.alert?.(
        ok ? openUrl : 'Не удалось скопировать',
        ok ? 'Ссылка скопирована' : 'Ошибка',
      );
    });
    host.appendChild(copyBtn);

    const skip = global.document.createElement('button');
    skip.type = 'button';
    skip.className = 'web-auth-login-btn web-auth-login-btn-secondary';
    skip.textContent = 'Продолжить в браузере как гость';
    skip.addEventListener('click', hideOverlay);
    host.appendChild(skip);

    const hint = global.document.createElement('p');
    hint.className = 'web-auth-alt';
    hint.textContent = inTelegramBrowser
      ? 'Вы уже в Telegram. Для Mini App нажмите LAUNCH в чате с ботом или «Как открыть Mini App». OAuth — через кнопку «Войти через Telegram в браузере».'
      : isMobileDevice()
        ? 'На следующем экране нажмите LAUNCH / ЗАПУСТИТЬ. Если Telegram не открылся — вставьте скопированную ссылку в браузер телефона.'
        : 'На компьютере для admin-панели нажмите «Войти через Telegram в браузере». Кнопка «Открыть в приложении» не логинит этот браузер.';
    host.appendChild(hint);

    const link = global.document.createElement('a');
    link.className = 'web-auth-alt web-auth-open-link';
    link.href = openUrl;
    link.textContent = openUrl;
    link.addEventListener('click', (e) => {
      e.preventDefault();
      if (!openTelegramMiniAppSafely(startParam)) navigateToTelegram(startParam);
    });
    host.appendChild(link);
  }

  function mountLoginUi() {
    const host = widgetHost();
    if (!host) return;
    const startParam = readStartParamFromUrl();
    const openUrl = buildTelegramOpenUrl(startParam);
    renderLoginButtons(host, openUrl, startParam);

    fetchAuthConfig()
      .then((cfg) => {
        const nextUrl = resolveTelegramOpenUrl(cfg);
        if (nextUrl && nextUrl !== openUrl) renderLoginButtons(host, nextUrl, startParam);
      })
      .catch(() => {
        /* meta-based url already shown */
      });
  }

  async function loginWithTelegram(user) {
    const startParam = readStartParamFromUrl();
    const body = { telegramUser: user };
    if (startParam) body.startParam = startParam;
    const res = await apiFetch('/api/auth/telegram-login', {
      method: 'POST',
      body: JSON.stringify(body),
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

  function readAuthErrorFromUrl() {
    try {
      const u = new URL(global.location.href);
      const err = u.searchParams.get('auth_error');
      if (!err) return null;
      u.searchParams.delete('auth_error');
      const qs = u.searchParams.toString();
      global.history.replaceState({}, '', u.pathname + (qs ? `?${qs}` : '') + u.hash);
      const messages = {
        invalid: 'Telegram не подтвердил вход. Попробуйте «Войти через Telegram в браузере» ещё раз.',
        server: 'Ошибка настройки сервера (TELEGRAM_BOT_TOKEN).',
        session: 'Не удалось создать сессию. Проверьте SESSION_SECRET на VPS.',
      };
      return messages[err] || 'Не удалось войти через Telegram.';
    } catch {
      return null;
    }
  }

  async function ensureSession() {
    const startParam = readStartParamFromUrl();
    if (startParam) persistStartParam(startParam);

    const authError = readAuthErrorFromUrl();
    if (authError) global.VMRuntime?.alert?.(authError, 'Вход через Telegram');

    if (isTelegramMiniApp()) {
      hideOverlay();
      global.__vmWebGuest = false;
      return true;
    }

    const hashUser = parseTgAuthResultFromHash();
    if (hashUser) {
      try {
        await loginWithTelegram(hashUser);
      } catch (e) {
        global.VMRuntime?.alert(e.message || 'Не удалось войти');
      }
    }

    if (consumeQueryFlag('guest_merged')) showMergeNotice();

    const sessionPath = startParam
      ? `/api/auth/session?startapp=${encodeURIComponent(startParam)}`
      : '/api/auth/session';
    const sessionRes = await apiFetch(sessionPath);
    const session = await sessionRes.json().catch(() => ({}));
    if (!sessionRes.ok && (session.error === 'guest_ip_limit' || session.requiresLogin)) {
      global.__vmGuestIpBlocked = session.error === 'guest_ip_limit';
      global.VMRuntime?.alert?.(session.message || 'Откройте приложение в Telegram', 'Нужен вход');
      showOverlay();
      global.__vmWebGuest = false;
      return false;
    }
    global.__vmGuestIpBlocked = false;
    global.__vmWebGuest = Boolean(session.isGuest);
    applyUserToUi(session.user, session.isGuest);
    hideOverlay();
    return true;
  }

  /** Открыть Mini App в Telegram (онбординг, рефералка). */
  function openInTelegramApp() {
    if (!openTelegramMiniAppSafely(readStartParamFromUrl())) {
      navigateToTelegram(readStartParamFromUrl());
    }
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
    openInTelegramApp,
    applyUserToUi,
    isGuest: () => Boolean(global.__vmWebGuest),
  };
})(window);
