// Initialize Telegram Web App
const tg = window.Telegram.WebApp;
tg.expand();
tg.ready();

const PREMIUM_BOT_URL = 'https://t.me/PremiumBot';
const PREMIUM_BOT_HANDLE = '@PremiumBot';

const HISTORY_KEY = 'vm_history_v1';
const SETTINGS_KEY = 'vm_settings_v1';

/** Заголовки для Vercel API: подпись Telegram Mini App (обязательно). */
function miniAppHeaders(jsonBody = false) {
    const h = {};
    if (jsonBody) h['Content-Type'] = 'application/json';
    if (tg.initData) h['X-Telegram-Init-Data'] = tg.initData;
    return h;
}

function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function parseDataUrl(dataUrl) {
    const m = /^data:([^;]+);base64,(.+)$/.exec(dataUrl || '');
    if (!m) return null;
    return { mimeType: m[1], imageBase64: m[2] };
}

function appendHistoryEntry(entry) {
    try {
        const raw = localStorage.getItem(HISTORY_KEY);
        const list = raw ? JSON.parse(raw) : [];
        list.unshift({ ...entry, ts: Date.now() });
        localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, 40)));
    } catch (e) { /* ignore */ }
}

function readLocalObject(key, fallback = {}) {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
        return fallback;
    }
}

function writeLocalObject(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (e) { /* ignore */ }
}

function updateSavedSettings(patch) {
    const current = readLocalObject(SETTINGS_KEY, {});
    writeLocalObject(SETTINGS_KEY, { ...current, ...patch });
}

function loadSavedSettings() {
    return readLocalObject(SETTINGS_KEY, {});
}

// Set user name if available (отображение; userId на сервере только из initData)
if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
    document.getElementById('user-name').textContent = tg.initDataUnsafe.user.first_name;
}

/** Текущий тариф с сервера (для проверки Premium перед постингом картинки). */
let userPlan = 'free';

// Global state
let currentGeneratedText = '';
let currentGeneratedScore = 0;
let studioMode = 'text';
let currentImageDataUrl = '';
let planRefreshTimer = null;

function isDesktopLikeClient() {
    const platform = String(tg.platform || '').toLowerCase();
    if (platform.includes('tdesktop') || platform.includes('macos') || platform.includes('windows') || platform.includes('linux')) {
        return true;
    }
    const ua = navigator.userAgent || '';
    return /\bMacintosh\b|\bWindows\b|\bLinux\b/i.test(ua) && !/\bAndroid\b|\biPhone\b|\biPad\b/i.test(ua);
}

function openPremiumBot() {
    if (typeof tg.openTelegramLink === 'function') {
        tg.openTelegramLink(PREMIUM_BOT_URL);
        return;
    }
    if (typeof tg.openLink === 'function') {
        tg.openLink(PREMIUM_BOT_URL);
        return;
    }
    window.open(PREMIUM_BOT_URL, '_blank', 'noopener');
}

async function copyPremiumBotHandle() {
    try {
        await navigator.clipboard.writeText(PREMIUM_BOT_HANDLE);
        if (typeof tg.showPopup === 'function') {
            tg.showPopup({
                title: 'Скопировано',
                message: 'Скопировал @PremiumBot. Откройте поиск в Telegram, вставьте username, купите Stars и вернитесь сюда.',
                buttons: [{ type: 'ok' }],
            });
            return;
        }
        tg.showAlert('Скопировал @PremiumBot. Откройте поиск в Telegram, вставьте username, купите Stars и вернитесь сюда.');
    } catch (e) {
        tg.showAlert('Откройте поиск в Telegram и найдите @PremiumBot вручную.');
    }
}

function handlePremiumBotAction() {
    if (isDesktopLikeClient()) {
        copyPremiumBotHandle();
        return;
    }
    openPremiumBot();
}

async function buyPlanViaTribute(plan) {
    try {
        const response = await fetch(`/api/tribute-link?plan=${encodeURIComponent(plan)}`);
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            tg.showAlert(data.message || data.error || 'Не удалось открыть Tribute.');
            return;
        }
        if (data.link) {
            startPlanRefreshPolling();
            if (typeof tg.openLink === 'function') {
                tg.openLink(data.link);
            } else {
                window.open(data.link, '_blank', 'noopener');
            }
        }
    } catch (error) {
        console.error('Tribute payment error:', error);
        tg.showAlert('Произошла ошибка при открытии Tribute.');
    }
}

function stopPlanRefreshPolling() {
    if (planRefreshTimer) {
        clearInterval(planRefreshTimer);
        planRefreshTimer = null;
    }
}

function startPlanRefreshPolling() {
    stopPlanRefreshPolling();
    let attempts = 0;
    planRefreshTimer = setInterval(async () => {
        attempts += 1;
        const previousPlan = userPlan;
        await loadUserData({ silent: true });
        if (userPlan !== previousPlan && (userPlan === 'pro' || userPlan === 'premium')) {
            stopPlanRefreshPolling();
            tg.showPopup({
                title: 'Подписка активирована',
                message: userPlan === 'premium' ? 'Premium уже доступен в приложении.' : 'Pro уже доступен в приложении.',
                buttons: [{ type: 'ok' }],
            });
            return;
        }
        if (attempts >= 20) {
            stopPlanRefreshPolling();
        }
    }, 4000);
}

function showStarsHelp(plan) {
    const planLabel = plan === 'premium' ? 'Premium' : 'Pro';
    const platformHint = isDesktopLikeClient()
        ? 'На компьютере Telegram иногда не открывает форму покупки Stars для такого товара.'
        : 'На iPhone и Android встроенная покупка может быть недоступна или не сработать в вашем регионе.';
    if (typeof tg.showPopup === 'function') {
        tg.showPopup({
            title: `${planLabel}: оплата через Stars`,
            message: `${platformHint}\n\nМожно оплатить картой через Tribute или купить Stars через @PremiumBot.`,
            buttons: [
                {
                    id: `open-tribute-${plan}`,
                    type: 'default',
                    text: 'Оплатить картой',
                },
                {
                    id: isDesktopLikeClient() ? 'copy-premiumbot' : 'open-premiumbot',
                    type: 'default',
                    text: isDesktopLikeClient() ? 'Скопировать @PremiumBot' : 'Купить Stars',
                },
                { type: 'cancel', text: 'Позже' },
            ],
        }, (buttonId) => {
            if (buttonId === 'open-premiumbot') openPremiumBot();
            if (buttonId === 'copy-premiumbot') copyPremiumBotHandle();
            if (buttonId === `open-tribute-${plan}`) buyPlanViaTribute(plan);
        });
        return;
    }
    tg.showAlert('Оплата подписки идет через Telegram Stars. Если форма не открывается, оплатите картой через Tribute или купите Stars через @PremiumBot.');
}

const savedSettings = loadSavedSettings();
const settingsChannel = document.getElementById('settings-channel');
const settingsModel = document.getElementById('settings-model');
const studioPlatform = document.getElementById('studio-platform');
const studioTone = document.getElementById('studio-tone');
const imageAspect = document.getElementById('image-aspect');
const imageStyle = document.getElementById('image-style');

if (savedSettings.channel && settingsChannel) settingsChannel.value = savedSettings.channel;
if (savedSettings.model && settingsModel) settingsModel.value = savedSettings.model;
if (savedSettings.platform && studioPlatform) studioPlatform.value = savedSettings.platform;
if (savedSettings.tone && studioTone) studioTone.value = savedSettings.tone;
if (savedSettings.aspectRatio && imageAspect) imageAspect.value = savedSettings.aspectRatio;
if (savedSettings.style && imageStyle) imageStyle.value = savedSettings.style;

if (settingsChannel) settingsChannel.addEventListener('input', () => updateSavedSettings({ channel: settingsChannel.value.trim() }));
if (settingsModel) settingsModel.addEventListener('change', () => updateSavedSettings({ model: settingsModel.value }));
if (studioPlatform) studioPlatform.addEventListener('change', () => updateSavedSettings({ platform: studioPlatform.value }));
if (studioTone) studioTone.addEventListener('change', () => updateSavedSettings({ tone: studioTone.value }));
if (imageAspect) imageAspect.addEventListener('change', () => updateSavedSettings({ aspectRatio: imageAspect.value }));
if (imageStyle) imageStyle.addEventListener('change', () => updateSavedSettings({ style: imageStyle.value }));

function setStudioMode(mode) {
    studioMode = mode;
    const isText = mode === 'text';
    document.getElementById('mode-pill-text').classList.toggle('active', isText);
    document.getElementById('mode-pill-image').classList.toggle('active', !isText);
    document.getElementById('studio-text-options').classList.toggle('hidden', !isText);
    document.getElementById('studio-image-options').classList.toggle('hidden', isText);
    const label = document.getElementById('label-studio-topic');
    const ta = document.getElementById('studio-topic');
    if (isText) {
        label.textContent = 'Опиши идею или вставь тему';
        ta.placeholder = 'Например: Как использовать AI для бизнеса в 2026 году...';
    } else {
        label.textContent = 'Опиши, что должно быть на картинке';
        ta.placeholder = 'Например: яркий постер про нейросети, неон, тёмный фон...';
    }
    document.getElementById('result-container').classList.add('hidden');
}

function alertFromGenerateError(message) {
    const m = String(message || '');
    let text = 'Произошла ошибка при генерации.';
    if (/503|high demand|Service Unavailable|UNAVAILABLE/i.test(m)) {
        text = 'Сервис Google временно перегружен. Подождите минуту и попробуйте снова.';
    } else if (/User location is not supported for the API use/i.test(m)) {
        text = 'Этот ключ Gemini недоступен из текущего региона. Нужен другой проект или ключ с поддержкой этого региона.';
    } else if (/API[_ ]?key|401|403|PERMISSION_DENIED|invalid api/i.test(m)) {
        text = 'Проблема с ключом или доступом к API. Проверьте GEMINI_API_KEY на сервере.';
    } else if (/404|not found for API version|no longer available|ListModels/i.test(m)) {
        text = 'Модель недоступна для вашего ключа. Обновите приложение или проверьте доступ в Google AI Studio.';
    } else if (/missing_init_data|invalid_init_data|Откройте приложение из Telegram/i.test(m)) {
        text = 'Откройте мини-приложение из Telegram (кнопка в боте), чтобы подпись сессии передалась на сервер.';
    } else if (/kv_required|Redis/i.test(m)) {
        text = 'На сервере не настроено хранилище Redis. Добавьте Upstash Redis в Vercel и переменные окружения.';
    } else if (/rate_limit|429|Слишком много запросов/i.test(m)) {
        text = 'Слишком много запросов за короткое время. Подождите около минуты и попробуйте снова.';
    } else if (m && m.length < 320 && !/^Ошибка генерации \(\d+\)$/.test(m)) {
        text = m;
    }
    tg.showAlert(text);
}

document.getElementById('mode-pill-text').addEventListener('click', () => setStudioMode('text'));
document.getElementById('mode-pill-image').addEventListener('click', () => setStudioMode('image'));

// --- Tab Navigation ---
function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));

    document.getElementById(`tab-${tabId}`).classList.add('active');

    document.querySelectorAll('.nav-item').forEach(nav => {
        if (nav.dataset.tab === tabId) {
            nav.classList.add('active');
        }
    });

    if (tabId === 'dashboard' || tabId === 'analytics') {
        loadDashboardData();
    }
}

function renderDashboardFromList(list) {
    const postsEl = document.getElementById('recent-posts-list');
    if (!list.length) {
        postsEl.innerHTML = '<p class="text-muted">История пуста. Создайте пост или картинку в студии.</p>';
    } else {
        postsEl.innerHTML = list.slice(0, 10).map((item) => {
            const date = new Date(item.ts).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
            const kind = item.type === 'image' ? 'Картинка' : 'Текст';
            const preview = item.type === 'image'
                ? `<div class="post-card-content text-muted">🖼 ${escapeHtml((item.prompt || '').slice(0, 140))}${(item.prompt || '').length > 140 ? '…' : ''}</div>`
                : `<div class="post-card-content">${escapeHtml((item.text || '').slice(0, 140))}${(item.text || '').length > 140 ? '…' : ''}</div>`;
            return `<div class="post-card"><div class="post-card-header"><span>${date}</span><span>${kind}</span></div>${preview}</div>`;
        }).join('');
    }

    const textItems = list.filter((i) => i.type === 'text' && typeof i.score === 'number');
    document.getElementById('stat-total').textContent = String(list.length);
    const avg = textItems.length
        ? Math.round(textItems.reduce((s, i) => s + i.score, 0) / textItems.length)
        : null;
    document.getElementById('stat-avg').textContent = avg != null ? String(avg) : '—';

    const best = textItems.reduce((acc, i) => (!acc || i.score > acc.score ? i : acc), null);
    const topEl = document.getElementById('top-post-card');
    if (best) {
        topEl.innerHTML = `<div class="post-card-content">${escapeHtml((best.text || '').slice(0, 220))}${(best.text || '').length > 220 ? '…' : ''}</div><div class="trend-score" style="margin-top:8px">Viral score: ${best.score}</div>`;
    } else {
        topEl.innerHTML = '<p class="text-muted">Нет текстовых постов в истории</p>';
    }

    const chart = document.getElementById('analytics-chart');
    const lastText = textItems.slice(0, 7);
    if (!lastText.length) {
        chart.innerHTML = '<p class="text-muted" style="padding:12px 0">Нет данных для графика</p>';
    } else {
        const maxS = Math.max(...lastText.map((i) => i.score), 1);
        const seq = [...lastText].reverse();
        chart.innerHTML = seq.map((i) => {
            const h = Math.round((i.score / maxS) * 100);
            return `<div class="chart-bar-wrapper"><div class="chart-bar" style="height:${h}%"></div><div class="chart-label">${i.score}</div></div>`;
        }).join('');
    }
}

function clearNode(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
}

// --- Dashboard & Analytics: сервер (KV) + кэш в localStorage ---
async function loadDashboardData() {
    let list = null;
    try {
        const res = await fetch('/api/history', { headers: miniAppHeaders(false) });
        if (res.ok) {
            const data = await res.json().catch(() => ({}));
            if (Array.isArray(data.items)) {
                list = data.items;
                try {
                    localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, 40)));
                } catch (e) { /* ignore */ }
            }
        }
    } catch (e) {
        /* offline / no KV */
    }
    if (!Array.isArray(list)) {
        try {
            const raw = localStorage.getItem(HISTORY_KEY);
            list = raw ? JSON.parse(raw) : [];
        } catch (e) {
            list = [];
        }
    }
    renderDashboardFromList(list);
}

// --- User Data ---
async function loadUserData(options = {}) {
    const { silent = false } = options;
    try {
        const response = await fetch('/api/user', { headers: miniAppHeaders(false) });
        const data = await response.json().catch(() => ({}));
        if (response.status === 401 || response.status === 503) {
            const msg = data.message || data.error || 'Проверьте настройки сервера (KV, Telegram).';
            console.warn('loadUserData:', response.status, msg);
            if (response.status === 401 && !silent) tg.showAlert('Откройте приложение из Telegram, чтобы загрузить профиль.');
            return;
        }
        if (data && data.plan) {
            userPlan = data.plan;
            updatePlanUI(data.plan, data.planUntil || null);
        }
        if (data && data.profile) {
            document.getElementById('profile-niche').value = data.profile.niche || '';
            document.getElementById('profile-language').value = data.profile.language || '';
            document.getElementById('profile-style').value = data.profile.styleNote || '';
        }
    } catch (error) {
        console.error('Error loading user data:', error);
    }
}

document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
        loadUserData({ silent: true });
    }
});

window.addEventListener('focus', () => {
    loadUserData({ silent: true });
});

document.getElementById('btn-save-profile').addEventListener('click', async () => {
    const niche = document.getElementById('profile-niche').value.trim();
    const language = document.getElementById('profile-language').value.trim();
    const styleNote = document.getElementById('profile-style').value.trim();
    try {
        const response = await fetch('/api/user', {
            method: 'POST',
            headers: miniAppHeaders(true),
            body: JSON.stringify({ niche, language, styleNote }),
        });
        const data = await response.json().catch(() => ({}));
        if (response.status === 503) {
            tg.showAlert(data.message || 'Нужен Upstash Redis для сохранения профиля на сервере.');
            return;
        }
        if (!response.ok) {
            tg.showAlert(data.message || data.error || 'Не удалось сохранить.');
            return;
        }
        tg.showPopup({ title: 'Готово', message: 'Профиль сохранён. Новые генерации будут с учётом этих настроек.' });
    } catch (e) {
        tg.showAlert('Ошибка сети при сохранении профиля.');
    }
});

function updatePlanUI(plan, planUntil) {
    const badge = document.getElementById('current-plan-badge');
    const upgradeBtn = document.getElementById('btn-upgrade-pro');

    if (plan === 'pro' || plan === 'premium') {
        badge.className = 'plan-badge plan-pro';
        let untilLine = '';
        if (planUntil) {
            try {
                const d = new Date(planUntil);
                if (!Number.isNaN(d.getTime())) {
                    untilLine = ` · до ${d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })}`;
                }
            } catch (e) { /* ignore */ }
        }
        badge.innerHTML =
            plan === 'premium'
                ? `Premium · картинки в канал${untilLine} ✨`
                : `Pro · безлимит${untilLine} ✨`;
        upgradeBtn.classList.add('hidden');
    } else {
        badge.className = 'plan-badge plan-free';
        badge.innerHTML = 'Free · 5 генераций/день';
        upgradeBtn.classList.remove('hidden');
    }
    const hintImg = document.getElementById('hint-image-publish');
    if (hintImg) hintImg.classList.toggle('hidden', plan === 'premium');
}

async function buyPlan(plan) {
    try {
        const response = await fetch('/api/create-invoice', {
            method: 'POST',
            headers: miniAppHeaders(true),
            body: JSON.stringify({ plan }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            tg.showAlert(data.message || data.error || 'Не удалось создать счёт.');
            return;
        }
        if (data.link) {
            tg.openInvoice(data.link, (status) => {
                if (status === 'paid') {
                    tg.showAlert('✨ Спасибо за покупку! Ваша подписка активирована.');
                    loadUserData();
                } else if (status === 'failed') {
                    showStarsHelp(plan);
                }
            });
        }
    } catch (error) {
        console.error('Payment error:', error);
        tg.showAlert('Произошла ошибка при создании счета.');
    }
}

async function activateDebugPlan(plan) {
    const secret = window.prompt('Введите DEBUG_ADMIN_SECRET');
    if (!secret) return;
    try {
        const response = await fetch('/api/debug-plan', {
            method: 'POST',
            headers: {
                ...miniAppHeaders(true),
                'X-Debug-Secret': secret.trim(),
            },
            body: JSON.stringify({ plan }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            tg.showAlert(data.message || data.error || 'Не удалось активировать тестовый тариф.');
            return;
        }
        tg.showPopup({
            title: 'Готово',
            message: `${data.plan === 'premium' ? 'Premium' : 'Pro'} активирован для текущего пользователя.`,
            buttons: [{ type: 'ok' }],
        });
        await loadUserData({ silent: true });
    } catch (error) {
        console.error('Debug plan error:', error);
        tg.showAlert('Ошибка при активации тестового тарифа.');
    }
}

async function activateManualPlan(plan) {
    const targetInput = document.getElementById('manual-target');
    const statusEl = document.getElementById('manual-activate-status');
    const target = targetInput ? targetInput.value.trim() : '';
    if (!target) {
        tg.showAlert('Введите @username или userId.');
        return;
    }

    const secret = window.prompt('Введите DEBUG_ADMIN_SECRET');
    if (!secret) return;

    if (statusEl) statusEl.textContent = 'Активирую тариф...';

    try {
        const response = await fetch('/api/manual-plan', {
            method: 'POST',
            headers: {
                ...miniAppHeaders(true),
                'X-Debug-Secret': secret.trim(),
            },
            body: JSON.stringify({ plan, target }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            const message = data.message || data.error || 'Не удалось активировать тариф.';
            if (statusEl) statusEl.textContent = message;
            tg.showAlert(message);
            return;
        }

        const targetLabel = data.telegramUsername ? `@${data.telegramUsername}` : data.userId;
        const until = data.planUntil ? new Date(data.planUntil).toLocaleDateString('ru-RU') : '';
        const text = `${data.plan === 'premium' ? 'Premium' : 'Pro'} выдан пользователю ${targetLabel}${until ? ` до ${until}` : ''}.`;
        if (statusEl) statusEl.textContent = text;
        tg.showPopup({
            title: 'Готово',
            message: text,
            buttons: [{ type: 'ok' }],
        });
    } catch (error) {
        console.error('Manual plan error:', error);
        if (statusEl) statusEl.textContent = 'Ошибка при ручной активации тарифа.';
        tg.showAlert('Ошибка при ручной активации тарифа.');
    }
}

document.getElementById('plan-pro').addEventListener('click', () => buyPlan('pro'));
document.getElementById('plan-premium').addEventListener('click', () => buyPlan('premium'));
document.getElementById('btn-open-premiumbot').addEventListener('click', handlePremiumBotAction);
document.getElementById('plan-pro-tribute').addEventListener('click', (e) => {
    e.stopPropagation();
    buyPlanViaTribute('pro');
});
document.getElementById('plan-premium-tribute').addEventListener('click', (e) => {
    e.stopPropagation();
    buyPlanViaTribute('premium');
});

if (isDesktopLikeClient()) {
    const premiumBotBtn = document.getElementById('btn-open-premiumbot');
    if (premiumBotBtn) premiumBotBtn.textContent = 'Скопировать @PremiumBot';
}

document.getElementById('btn-upgrade-pro').addEventListener('click', () => {
    buyPlan('pro');
});

document.getElementById('btn-debug-pro').addEventListener('click', () => activateDebugPlan('pro'));
document.getElementById('btn-debug-premium').addEventListener('click', () => activateDebugPlan('premium'));
document.getElementById('btn-manual-pro').addEventListener('click', () => activateManualPlan('pro'));
document.getElementById('btn-manual-premium').addEventListener('click', () => activateManualPlan('premium'));

// --- Trends Data ---
async function loadTrends() {
    try {
        const response = await fetch('/api/trends');
        const data = await response.json();
        const trends = Array.isArray(data.trends) ? data.trends : [];

        const strip = document.getElementById('dashboard-trends');
        clearNode(strip);
        trends.forEach((t) => {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'trend-chip';
            chip.textContent = `${t.emoji} ${t.name}`;
            chip.addEventListener('click', () => prefillStudio(t.name));
            strip.appendChild(chip);
        });

        const grid = document.getElementById('trends-grid');
        clearNode(grid);
        trends.forEach((t) => {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'trend-item';
            const emoji = document.createElement('div');
            emoji.className = 'trend-emoji';
            emoji.textContent = t.emoji;
            const name = document.createElement('div');
            name.className = 'trend-name';
            name.textContent = t.name;
            const score = document.createElement('div');
            score.className = 'trend-score';
            score.textContent = `Score: ${t.score}`;
            item.append(emoji, name, score);
            item.addEventListener('click', () => prefillStudio(t.name));
            grid.appendChild(item);
        });

    } catch (error) {
        console.error('Error loading trends:', error);
    }
}

function prefillStudio(topic) {
    setStudioMode('text');
    document.getElementById('studio-topic').value = topic;
    switchTab('studio');
}

// --- Content Generation ---
document.getElementById('btn-generate').addEventListener('click', async () => {
    const topic = document.getElementById('studio-topic').value.trim();
    const platform = studioPlatform.value;
    const tone = studioTone.value;
    const model = settingsModel.value || 'gemini-2.5-flash';

    const limitMsg = document.getElementById('limit-msg');
    limitMsg.classList.add('hidden');

    if (!topic) {
        tg.showAlert('Пожалуйста, введите тему или идею.');
        return;
    }

    const btn = document.getElementById('btn-generate');
    const originalText = btn.textContent;
    btn.textContent = 'Генерация... ⏳';
    btn.disabled = true;

    try {
        const response = await fetch('/api/generate', {
            method: 'POST',
            headers: miniAppHeaders(true),
            body: JSON.stringify({ topic, platform, tone, model }),
        });

        const data = await response.json();

        if (response.status === 403 && data.error === 'limit_reached') {
            limitMsg.innerHTML = `⚡️ Лимит 5 генераций исчерпан. <a href="javascript:void(0)" onclick="tg.openLink('https://t.me/tribute')">Перейти на Pro →</a>`;
            limitMsg.classList.remove('hidden');
            limitMsg.classList.add('error');
            return;
        }

        if (!response.ok) {
            const errText = typeof data?.error === 'string' ? data.error : '';
            throw new Error(data?.message || errText || `Ошибка генерации (${response.status})`);
        }

        currentGeneratedText = data.content;
        currentGeneratedScore = data.viralScore;
        currentImageDataUrl = '';

        const resultText = document.getElementById('result-text');
        resultText.textContent = currentGeneratedText;
        resultText.classList.remove('hidden');
        document.getElementById('result-image-wrap').classList.add('hidden');
        document.getElementById('result-score-wrap').classList.remove('hidden');
        document.getElementById('result-actions-text').classList.remove('hidden');
        document.getElementById('result-actions-image').classList.add('hidden');
        document.getElementById('result-score').textContent = currentGeneratedScore;

        document.getElementById('result-container').classList.remove('hidden');
        document.getElementById('publish-status').classList.add('hidden');

        appendHistoryEntry({
            type: 'text',
            topic: topic.slice(0, 240),
            text: currentGeneratedText,
            score: currentGeneratedScore,
        });
        if (document.getElementById('tab-dashboard').classList.contains('active')) loadDashboardData();

        // Show remaining generations for free users
        if (data.remainingToday !== undefined) {
            const remaining = data.remainingToday;
            if (remaining <= 2) {
                limitMsg.innerHTML = `⚡️ Осталось генераций сегодня: <b>${remaining}</b> из 5.`;
                limitMsg.classList.remove('hidden', 'error');
                limitMsg.classList.add('warning');
            }
        }

    } catch (error) {
        console.error(error);
        alertFromGenerateError(error.message);
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
});

async function runImageGeneration() {
    const prompt = document.getElementById('studio-topic').value.trim();
    const aspectRatio = imageAspect.value;
    const style = imageStyle.value;

    const limitMsg = document.getElementById('limit-msg');
    limitMsg.classList.add('hidden');

    if (!prompt) {
        tg.showAlert('Введите описание изображения.');
        return;
    }

    const btn = document.getElementById('btn-generate-image');
    const originalText = btn.textContent;
    btn.textContent = 'Рисуем... ⏳';
    btn.disabled = true;

    try {
        const response = await fetch('/api/generate-image', {
            method: 'POST',
            headers: miniAppHeaders(true),
            body: JSON.stringify({ prompt, aspectRatio, style }),
        });

        const data = await response.json();

        if (response.status === 403 && data.error === 'limit_reached') {
            limitMsg.innerHTML = `⚡️ Лимит 5 генераций исчерпан. <a href="javascript:void(0)" onclick="tg.openLink('https://t.me/tribute')">Перейти на Pro →</a>`;
            limitMsg.classList.remove('hidden');
            limitMsg.classList.add('error');
            return;
        }

        if (!response.ok) {
            const errText = typeof data?.error === 'string' ? data.error : '';
            throw new Error(data?.message || errText || `Ошибка (${response.status})`);
        }

        currentImageDataUrl = data.dataUrl;
        document.getElementById('result-image').src = data.dataUrl;
        const dl = document.getElementById('btn-download-image');
        dl.href = data.dataUrl;
        const ext = String(data.mimeType || '').includes('jpeg') ? 'jpg' : 'png';
        dl.download = `viral-maker-ai.${ext}`;

        document.getElementById('result-text').classList.add('hidden');
        document.getElementById('result-image-wrap').classList.remove('hidden');
        document.getElementById('result-score-wrap').classList.add('hidden');
        document.getElementById('result-actions-text').classList.add('hidden');
        document.getElementById('result-actions-image').classList.remove('hidden');

        document.getElementById('result-container').classList.remove('hidden');
        document.getElementById('publish-status').classList.add('hidden');

        appendHistoryEntry({ type: 'image', prompt: prompt.slice(0, 240) });
        if (document.getElementById('tab-dashboard').classList.contains('active')) loadDashboardData();

        if (data.remainingToday !== undefined) {
            const remaining = data.remainingToday;
            if (remaining <= 2) {
                limitMsg.innerHTML = `⚡️ Осталось генераций сегодня: <b>${remaining}</b> из 5.`;
                limitMsg.classList.remove('hidden', 'error');
                limitMsg.classList.add('warning');
            }
        }
    } catch (error) {
        console.error(error);
        alertFromGenerateError(error.message);
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
}

document.getElementById('btn-generate-image').addEventListener('click', () => runImageGeneration());
document.getElementById('btn-remake-image').addEventListener('click', () => runImageGeneration());

// --- Studio Actions ---
document.getElementById('btn-copy').addEventListener('click', () => {
    navigator.clipboard.writeText(currentGeneratedText).then(() => {
        tg.showPopup({ title: 'Скопировано', message: 'Текст скопирован в буфер обмена.' });
    });
});

document.getElementById('btn-remake').addEventListener('click', () => {
    document.getElementById('btn-generate').click();
});

document.getElementById('btn-publish').addEventListener('click', async () => {
    const channel = settingsChannel.value.trim();
    const statusEl = document.getElementById('publish-status');

    statusEl.classList.remove('hidden', 'success', 'error');

    if (!channel) {
        statusEl.textContent = 'Укажите канал в Настройках!';
        statusEl.classList.add('error');
        setTimeout(() => switchTab('settings'), 1500);
        return;
    }

    const btn = document.getElementById('btn-publish');
    btn.disabled = true;
    statusEl.textContent = 'Отправка...';

    try {
        const response = await fetch('/api/publish', {
            method: 'POST',
            headers: miniAppHeaders(true),
            body: JSON.stringify({ content: currentGeneratedText, channelUsername: channel }),
        });

        const data = await response.json();

        if (response.ok) {
            statusEl.textContent = 'Успешно опубликовано! ✅';
            statusEl.classList.add('success');
        } else {
            statusEl.textContent = data.error || 'Ошибка публикации';
            statusEl.classList.add('error');
        }
    } catch (error) {
        statusEl.textContent = 'Сетевая ошибка';
        statusEl.classList.add('error');
    } finally {
        btn.disabled = false;
    }
});

document.getElementById('btn-publish-image').addEventListener('click', async () => {
    const channel = settingsChannel.value.trim();
    const statusEl = document.getElementById('publish-status');
    const parts = parseDataUrl(currentImageDataUrl);
    if (!parts) {
        tg.showAlert('Сначала сгенерируйте изображение.');
        return;
    }
    if (userPlan !== 'premium') {
        tg.showAlert('Публикация картинок в канал доступна на тарифе Premium. Откройте Настройки → тариф Premium.');
        switchTab('settings');
        return;
    }
    if (!channel) {
        statusEl.classList.remove('hidden', 'success', 'error');
        statusEl.textContent = 'Укажите канал в Настройках!';
        statusEl.classList.add('error');
        statusEl.classList.remove('hidden');
        setTimeout(() => switchTab('settings'), 1500);
        return;
    }

    const btn = document.getElementById('btn-publish-image');
    btn.disabled = true;
    statusEl.classList.remove('hidden', 'success', 'error');
    statusEl.textContent = 'Отправка фото...';

    const caption = document.getElementById('studio-topic').value.trim().slice(0, 900);

    try {
        const response = await fetch('/api/publish', {
            method: 'POST',
            headers: miniAppHeaders(true),
            body: JSON.stringify({
                channelUsername: channel,
                content: caption || undefined,
                imageBase64: parts.imageBase64,
                mimeType: parts.mimeType,
            }),
        });
        const data = await response.json().catch(() => ({}));
        if (response.ok) {
            statusEl.textContent = 'Картинка в канале! ✅';
            statusEl.classList.add('success');
        } else {
            statusEl.textContent = data.message || data.error || 'Ошибка публикации';
            statusEl.classList.add('error');
        }
    } catch (error) {
        statusEl.textContent = 'Сетевая ошибка';
        statusEl.classList.add('error');
    } finally {
        btn.disabled = false;
    }
});

// Trend Search Filter
document.getElementById('trend-search').addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const items = document.querySelectorAll('#trends-grid .trend-item');
    items.forEach(item => {
        const name = item.querySelector('.trend-name').textContent.toLowerCase();
        if (name.includes(term)) {
            item.style.display = '';
        } else {
            item.style.display = 'none';
        }
    });
});

// Init
updatePlanUI('free', null);
loadUserData();
loadTrends();
loadDashboardData();
