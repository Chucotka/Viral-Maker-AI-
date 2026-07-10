// Telegram Web App или веб (тот же origin)
function getTg() {
  return window.VMRuntime?.tg || window.Telegram?.WebApp || null;
}

const tg = new Proxy(
  {},
  {
    get(_target, prop) {
      const api = getTg();
      if (!api || !(prop in api)) return undefined;
      const value = api[prop];
      return typeof value === 'function' ? value.bind(api) : value;
    },
  },
);

const PREMIUM_BOT_URL = 'https://t.me/PremiumBot';
const PREMIUM_BOT_HANDLE = '@PremiumBot';
const DEFAULT_SUPPORT_CHAT_URL = 'https://t.me/viral_maker_ai_bot?start=support';

let supportChatLink = DEFAULT_SUPPORT_CHAT_URL;

const HISTORY_KEY = 'vm_history_v1';
const SETTINGS_KEY = 'vm_settings_v1';
const DEFAULT_INTENT = 'auto';
const DEFAULT_RISK = 'balanced';

/** Заголовки API: initData (Telegram) или cookie-сессия (веб). */
function miniAppHeaders(jsonBody = false) {
    if (window.VMRuntime?.headers) return window.VMRuntime.headers(jsonBody);
    const h = {};
    if (jsonBody) h['Content-Type'] = 'application/json';
    const initData = getTg().initData;
    if (initData) h['X-Telegram-Init-Data'] = initData;
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

function syncDownloadImageButton(hasImage) {
    const btn = document.getElementById('btn-download-image');
    if (btn) btn.disabled = !hasImage;
}

async function saveCurrentImageToDevice() {
    const dataUrl = currentImageDataUrl;
    if (!dataUrl) {
        tg.showAlert('Сначала сгенерируйте изображение.');
        return;
    }
    const parts = parseDataUrl(dataUrl);
    const btn = document.getElementById('btn-download-image');
    const prevLabel = btn ? btn.textContent : '';
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Сохраняем…';
    }
    try {
        if (window.VMImageDownload) {
            const ok = await window.VMImageDownload.saveGeneratedImageToDevice({
                dataUrl,
                mimeType: parts?.mimeType,
                downloadUrl: currentImageDownloadUrl,
                downloadToken: currentImageDownloadToken,
                downloadFileName: currentImageDownloadFileName,
                tg,
                getHeaders: () => miniAppHeaders(true),
                onError: (msg) => tg.showAlert(msg),
            });
            if (ok) {
                trackHistoryFeedback({
                    increments: { downloadCount: 1 },
                    set: { lastDownloadedAt: Date.now() },
                });
            }
            return;
        }
        const blob = await fetch(dataUrl).then((r) => r.blob());
        const fileName = window.VMImageDownload?.fileNameFromMime?.(parts?.mimeType) || 'viral-maker-ai.png';
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = fileName;
        a.click();
        trackHistoryFeedback({
            increments: { downloadCount: 1 },
            set: { lastDownloadedAt: Date.now() },
        });
    } catch (e) {
        console.error(e);
        tg.showAlert('Не удалось сохранить. Удерживайте превью картинки → «Сохранить изображение».');
    } finally {
        if (btn) {
            btn.textContent = prevLabel || 'Сохранить в галерею';
            syncDownloadImageButton(!!currentImageDataUrl);
        }
    }
}

function formatStrategyLabel(angle) {
    const map = {
        story: 'история',
        insight: 'инсайт',
        practical: 'практика',
        proof: 'доказательство',
        offer: 'оффер',
        urgency: 'срочность',
        reflection: 'рефлексия',
        detail: 'деталь',
        simple: 'простой разбор',
        myth: 'миф vs правда',
        steps: 'пошагово',
        hot_take: 'смелый take',
        contrarian: 'контраргумент',
        debate: 'повод для спора',
        unexpected: 'неожиданный ход',
        contrast: 'контраст',
        fresh: 'свежий угол',
        fallback: 'fallback',
    };
    return map[String(angle || '').toLowerCase()] || String(angle || '').toLowerCase();
}

function formatRiskLabel(risk) {
    const map = {
        calm: 'спокойнее',
        balanced: 'баланс',
        bold: 'смелее',
    };
    return map[String(risk || '').toLowerCase()] || String(risk || '').toLowerCase();
}

function formatGoalLabel(goal) {
    const map = {
        reach: 'охват',
        trust: 'доверие',
        warmup: 'прогрев',
        sale: 'продажа',
        auto: 'авто',
    };
    return map[String(goal || '').toLowerCase()] || String(goal || '').toLowerCase();
}

function normalizeChannelInput(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (/^-?\d+$/.test(raw)) return raw;
    if (raw.startsWith('@')) return `@${raw.slice(1).trim().replace(/^@+/, '').toLowerCase()}`;
    const tmeMatch = raw.match(/^(?:https?:\/\/)?t\.me\/([^/?#]+)/i);
    if (tmeMatch) {
        const slug = String(tmeMatch[1] || '').trim().replace(/^@+/, '');
        return slug ? `@${slug.toLowerCase()}` : '';
    }
    const slug = raw.replace(/^@+/, '').trim();
    if (/^[A-Za-z0-9_]{4,}$/i.test(slug)) return `@${slug.toLowerCase()}`;
    return raw;
}

function buildResultMetaText(meta, variantLabel = 'A') {
    const parts = [];
    if (variantLabel) {
        parts.push(`Вариант ${variantLabel}`);
    }
    if (meta && meta.selectedAngle) {
        parts.push(`Угол: ${formatStrategyLabel(meta.selectedAngle)}`);
    } else {
        parts.push('Угол: авто');
    }
    if (meta && meta.goal) {
        parts.push(`Цель: ${formatGoalLabel(meta.goal)}`);
    }
    parts.push(meta && meta.rewriteApplied ? 'Переписано' : 'Без переписывания');
    if (meta && typeof meta.candidateCount === 'number') {
        parts.push(`Вариантов: ${meta.candidateCount}`);
    }
    if (meta && typeof meta.criticScore === 'number') {
        parts.push(`Критик: ${meta.criticScore}/100`);
    }
    if (meta && meta.risk) {
        parts.push(`Подача: ${formatRiskLabel(meta.risk)}`);
    }
    return parts.filter(Boolean).join(' · ');
}

function buildCriticText(meta) {
    if (!meta) return '';
    const parts = [];
    if (meta.criticVerdict) parts.push(meta.criticVerdict);
    if (Array.isArray(meta.criticStrengths) && meta.criticStrengths.length) {
        parts.push(`Сильные стороны: ${meta.criticStrengths.join('; ')}`);
    }
    const b = meta.criticBreakdown || {};
    const breakdown = [];
    if (typeof b.hook === 'number') breakdown.push(`Хук ${b.hook}/10`);
    if (typeof b.novelty === 'number') breakdown.push(`Новизна ${b.novelty}/10`);
    if (typeof b.clarity === 'number') breakdown.push(`Ясность ${b.clarity}/10`);
    if (typeof b.cta === 'number') breakdown.push(`CTA ${b.cta}/10`);
    if (typeof b.fit === 'number') breakdown.push(`Фит ${b.fit}/10`);
    if (breakdown.length) parts.push(breakdown.join(' · '));
    if (Array.isArray(meta.criticIssues) && meta.criticIssues.length) {
        parts.push(`Слабые места: ${meta.criticIssues.join('; ')}`);
    }
    return parts.filter(Boolean).join(' · ');
}

function syncVariantToggleButton() {
    const btn = document.getElementById('btn-toggle-variant');
    if (!btn) return;
    const hasAlternative = !!String(currentAlternativeText || '').trim();
    btn.classList.toggle('hidden', !hasAlternative);
    btn.textContent = currentDisplayedVariant === 'A' ? 'Показать B' : 'Показать A';
}

function renderTextResultView() {
    const resultText = document.getElementById('result-text');
    const resultScore = document.getElementById('result-score');
    const resultMeta = document.getElementById('result-meta');
    const resultCritic = document.getElementById('result-critic');
    const resultScoreWrap = document.getElementById('result-score-wrap');
    if (!resultText || !resultScore || !resultMeta || !resultScoreWrap) return;

    resultText.textContent = currentGeneratedText || '';
    resultText.classList.remove('hidden');
    document.getElementById('result-image-wrap').classList.add('hidden');
    resultScoreWrap.classList.remove('hidden');
    document.getElementById('result-actions-text').classList.remove('hidden');
    document.getElementById('result-refine-text').classList.remove('hidden');
    document.getElementById('result-actions-image').classList.add('hidden');
    resultScore.textContent = String(currentGeneratedScore || 0);
    resultMeta.textContent = buildResultMetaText(currentGeneratedMeta, currentDisplayedVariant);
    resultMeta.classList.toggle('hidden', !resultMeta.textContent);
    if (resultCritic) {
        const criticText = currentDisplayedVariant === 'A'
            ? (currentGeneratedCriticText || buildCriticText(currentGeneratedMeta))
            : '';
        resultCritic.textContent = criticText;
        resultCritic.classList.toggle('hidden', !resultCritic.textContent);
    }
    syncVariantToggleButton();
}

function syncCurrentHistoryFromItem(item) {
    if (!item || typeof item !== 'object') return;
    currentHistoryTs = Number(item.ts) || 0;
    currentHistoryType = String(item.type || '');
}

function trackHistoryFeedback(mutation = {}) {
    if (!currentHistoryTs) return;
    updateHistoryCacheEntry(currentHistoryTs, mutation);
    pushHistoryFeedback(currentHistoryTs, mutation).catch(() => {});
}

function activateTextVariant(variant) {
    const next = String(variant || 'A');
    const hasAlt = !!String(currentAlternativeText || '').trim();
    if (next === currentDisplayedVariant || !hasAlt) {
      renderTextResultView();
      return;
    }
    [currentGeneratedText, currentAlternativeText] = [currentAlternativeText, currentGeneratedText];
    [currentGeneratedScore, currentAlternativeScore] = [currentAlternativeScore, currentGeneratedScore];
    [currentGeneratedMeta, currentAlternativeMeta] = [currentAlternativeMeta, currentGeneratedMeta];
    currentDisplayedVariant = next;
    renderTextResultView();
}

function historyItemKey(item) {
    if (window.VMHistory && typeof window.VMHistory.historyItemKey === 'function') {
        return window.VMHistory.historyItemKey(item);
    }
    const ts = item && typeof item.ts === 'number' ? item.ts : '';
    const type = String(item?.type || '');
    const text = String(item?.text || item?.prompt || item?.topic || '');
    return `${ts}|${type}|${text}`;
}

function appendHistoryEntry(entry) {
    try {
        const raw = localStorage.getItem(HISTORY_KEY);
        const list = raw ? JSON.parse(raw) : [];
        const ts = Number(entry?.ts) || Date.now();
        let saved = { ...entry, ts };
        if (saved.type === 'image' && saved.dataUrl && window.VMHistory) {
            window.VMHistory.persistImageBlob(ts, saved.dataUrl, saved.mimeType);
            const { dataUrl, ...meta } = saved;
            saved = meta;
        }
        list.unshift(saved);
        const toStore = window.VMHistory
            ? window.VMHistory.prepareListForStorage(list.slice(0, 40))
            : list.slice(0, 40);
        localStorage.setItem(HISTORY_KEY, JSON.stringify(toStore));
        return window.VMHistory ? window.VMHistory.hydrateHistoryItem({ ...saved, ts, type: entry.type, prompt: entry.prompt }) : { ...entry, ts };
    } catch (e) { /* ignore */ }
    return null;
}

function readHistoryCache() {
    try {
        const raw = localStorage.getItem(HISTORY_KEY);
        const list = raw ? JSON.parse(raw) : [];
        return window.VMHistory ? window.VMHistory.hydrateHistoryList(list) : list;
    } catch (e) {
        return [];
    }
}

function applyHistoryMutation(item, mutation = {}) {
    const set = mutation && typeof mutation.set === 'object' ? mutation.set : {};
    const increments = mutation && typeof mutation.increments === 'object' ? mutation.increments : {};
    const next = { ...item };
    Object.entries(set).forEach(([key, value]) => {
        next[key] = value;
    });
    Object.entries(increments).forEach(([key, value]) => {
        const delta = Number(value);
        if (!Number.isFinite(delta) || delta === 0) return;
        next[key] = (Number(next[key]) || 0) + delta;
    });
    return next;
}

function updateHistoryCacheEntry(ts, mutation = {}) {
    const targetTs = Number(ts);
    if (!Number.isFinite(targetTs)) return null;
    try {
        const raw = localStorage.getItem(HISTORY_KEY);
        const list = raw ? JSON.parse(raw) : [];
        const index = list.findIndex((item) => Number(item?.ts) === targetTs);
        if (index < 0) return null;
        const updated = applyHistoryMutation(list[index], mutation);
        list[index] = updated;
        localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, 40)));
        return updated;
    } catch (e) {
        return null;
    }
}

async function pushHistoryFeedback(ts, mutation = {}) {
    const response = await fetch('/api/history', {
        method: 'POST',
        headers: miniAppHeaders(true),
        body: JSON.stringify({ ts, mutation }),
    });
    return response.ok;
}

function mergeHistoryLists(serverList, localList) {
    if (window.VMHistory && typeof window.VMHistory.mergeHistoryLists === 'function') {
        return window.VMHistory.hydrateHistoryList(
            window.VMHistory.mergeHistoryLists(serverList, localList),
        );
    }
    const merged = new Map();
    const add = (item) => {
        if (!item || typeof item !== 'object') return;
        const key = historyItemKey(item);
        const prev = merged.get(key);
        merged.set(key, prev ? { ...prev, ...item } : item);
    };
    (Array.isArray(serverList) ? serverList : []).forEach(add);
    (Array.isArray(localList) ? localList : []).forEach(add);
    return [...merged.values()].sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 40);
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
    const firstName = tg.initDataUnsafe.user.first_name;
    document.getElementById('user-name').textContent = firstName;
    const settingsHeroName = document.getElementById('settings-hero-name');
    if (settingsHeroName) settingsHeroName.textContent = firstName;
    const settingsHeroAvatar = document.getElementById('settings-hero-avatar');
    if (settingsHeroAvatar && tg.initDataUnsafe.user.photo_url) {
        settingsHeroAvatar.innerHTML = `<img src="${tg.initDataUnsafe.user.photo_url}" alt="" class="settings-hero-avatar-img">`;
    }
}

/** Текущий тариф с сервера (для проверки Premium перед постингом картинки). */
let userPlan = 'free';

// Global state
let currentGeneratedText = '';
let currentGeneratedScore = 0;
let currentGeneratedMeta = null;
let currentGeneratedCriticText = '';
let currentAlternativeText = '';
let currentAlternativeScore = 0;
let currentAlternativeMeta = null;
let currentDisplayedVariant = 'A';
let currentHistoryTs = 0;
let currentHistoryType = '';
let studioMode = 'text';
let generationSeq = 0;
let activeGenerationSeq = 0;
let generationStartedAt = 0;
const ACTIVE_GENERATION_KEY = 'vm_active_generation_v1';
let recoveryPollTimer = null;
let recoveryPollSeq = 0;
let recoveryPollAttempts = 0;
const RECOVERY_POLL_INTERVAL_MS = 3000;
const RECOVERY_POLL_MAX_ATTEMPTS = 50; // ~150 сек
let currentImageDataUrl = '';
let currentImageDownloadUrl = '';
let currentImageDownloadToken = '';
let currentImageDownloadFileName = '';
let planRefreshTimer = null;
let studioIntent = savedIntent();
let studioRiskLevel = savedRisk();

function savedIntent() {
    const value = readLocalObject(SETTINGS_KEY, {}).intent;
    return typeof value === 'string' && value ? value : DEFAULT_INTENT;
}

function savedRisk() {
    const value = readLocalObject(SETTINGS_KEY, {}).risk;
    return typeof value === 'string' && value ? value : DEFAULT_RISK;
}

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

function openSupportChat() {
    const url = supportChatLink || DEFAULT_SUPPORT_CHAT_URL;
    try {
        if (typeof tg.openTelegramLink === 'function') {
            tg.openTelegramLink(url);
            return;
        }
    } catch {
        /* ignore */
    }
    try {
        if (typeof tg.openLink === 'function') {
            tg.openLink(url);
            return;
        }
    } catch {
        /* ignore */
    }
    window.open(url, '_blank', 'noopener');
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
const studioRisk = document.getElementById('studio-risk');
const imageAspect = document.getElementById('image-aspect');
const imageStyle = document.getElementById('image-style');
const studioIntentHint = document.getElementById('studio-intent-hint');

const INTENT_HINTS = {
    auto: 'Авто: если идея сырая, приложение само достроит сильное ТЗ.',
    sell: 'Продай идею: усиливает оффер, пользу и CTA.',
    personal: 'Личный пост: делает текст живым, от первого лица и ближе к опыту.',
    explain: 'Объясни просто: превращает тему в понятное объяснение без воды.',
    provocative: 'Провокация: делает хук смелее и острее, но без трэша.',
    surprise: 'Удиви меня: приложение само выберет сильный угол и напишет готовый пост.',
};

if (savedSettings.channel && settingsChannel) settingsChannel.value = savedSettings.channel;
if (savedSettings.model && settingsModel) settingsModel.value = savedSettings.model;
if (savedSettings.platform && studioPlatform) studioPlatform.value = savedSettings.platform;
if (savedSettings.tone && studioTone) studioTone.value = savedSettings.tone;
if (savedSettings.risk && studioRisk) studioRisk.value = savedSettings.risk;
if (savedSettings.aspectRatio && imageAspect) imageAspect.value = savedSettings.aspectRatio;
if (savedSettings.style && imageStyle) imageStyle.value = savedSettings.style;
if (studioRisk) studioRiskLevel = studioRisk.value;

if (settingsChannel) settingsChannel.addEventListener('input', () => updateSavedSettings({ channel: settingsChannel.value.trim() }));
if (settingsModel) settingsModel.addEventListener('change', () => updateSavedSettings({ model: settingsModel.value }));
if (studioPlatform) studioPlatform.addEventListener('change', () => updateSavedSettings({ platform: studioPlatform.value }));
if (studioTone) studioTone.addEventListener('change', () => updateSavedSettings({ tone: studioTone.value }));
if (studioRisk) studioRisk.addEventListener('change', () => {
    studioRiskLevel = studioRisk.value;
    updateSavedSettings({ risk: studioRisk.value });
});
if (imageAspect) imageAspect.addEventListener('change', () => updateSavedSettings({ aspectRatio: imageAspect.value }));
if (imageStyle) imageStyle.addEventListener('change', () => updateSavedSettings({ style: imageStyle.value }));

function setStudioIntent(intent) {
    const next = String(intent || DEFAULT_INTENT);
    studioIntent = next;
    updateSavedSettings({ intent: next });
    document.querySelectorAll('.intent-pill').forEach((pill) => {
        pill.classList.toggle('active', pill.dataset.intent === next);
    });
    if (studioIntentHint) {
        studioIntentHint.textContent = INTENT_HINTS[next] || INTENT_HINTS.auto;
    }
    const topicInput = document.getElementById('studio-topic');
    if (next === 'surprise' && topicInput && !topicInput.value.trim()) {
        topicInput.value = 'Удиви меня';
    }
}

document.querySelectorAll('.intent-pill').forEach((pill) => {
    pill.addEventListener('click', () => setStudioIntent(pill.dataset.intent || DEFAULT_INTENT));
});
setStudioIntent(studioIntent);

const STUDIO_MODE_HINTS = {
    text: 'Картинки и текст делят один дневной лимит на Free.',
    script: 'Сценарий для Reels, TikTok и Shorts: хук, кадры, CTA и хэштеги.',
    image: 'Картинки и текст делят один дневной лимит на Free.',
};

function setStudioMode(mode) {
    studioMode = mode;
    const isText = mode === 'text';
    const isScript = mode === 'script';
    const isImage = mode === 'image';
    document.getElementById('mode-pill-text').classList.toggle('active', isText);
    document.getElementById('mode-pill-script').classList.toggle('active', isScript);
    document.getElementById('mode-pill-image').classList.toggle('active', isImage);
    document.getElementById('studio-text-options').classList.toggle('hidden', !isText);
    document.getElementById('studio-script-options').classList.toggle('hidden', !isScript);
    document.getElementById('studio-image-options').classList.toggle('hidden', !isImage);
    const intentGroup = document.getElementById('studio-intent-group');
    if (intentGroup) intentGroup.classList.toggle('hidden', !isText && !isScript);
    const modeHint = document.getElementById('studio-mode-hint');
    if (modeHint) modeHint.textContent = STUDIO_MODE_HINTS[mode] || STUDIO_MODE_HINTS.text;
    const label = document.getElementById('label-studio-topic');
    const ta = document.getElementById('studio-topic');
    if (isImage) {
        label.textContent = 'Опиши, что должно быть на картинке';
        ta.placeholder = 'Например: яркий постер про нейросети, неон, тёмный фон...';
    } else if (isScript) {
        label.textContent = 'Тема ролика или ключевая мысль';
        ta.placeholder = 'Например: 3 ошибки при запуске Telegram-канала...';
    } else {
        label.textContent = 'Опиши идею или вставь тему';
        ta.placeholder = 'Например: Как использовать AI для бизнеса в 2026 году...';
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
        if (window.VMRuntime?.isWeb && window.VMWebAuth) {
            window.VMWebAuth.showOverlay();
            return;
        }
        text = 'Откройте мини-приложение из Telegram (кнопка в боте), чтобы подпись сессии передалась на сервер.';
    } else if (/kv_required|Redis/i.test(m)) {
        text = 'На сервере не настроено хранилище Redis. Добавьте Upstash Redis в Vercel и переменные окружения.';
    } else if (/rate_limit|429|Слишком много запросов/i.test(m)) {
        text = 'Слишком много запросов за короткое время. Подождите около минуты и попробуйте снова.';
    } else if (/504|FUNCTION_INVOCATION_TIMEOUT|timeout|timed out|aborted/i.test(m)) {
        text = 'Сервер не успел ответить. Загляните в Дашборд — результат мог сохраниться в истории.';
    } else if (m && m.length < 320 && !/^Ошибка генерации \(\d+\)$/.test(m)) {
        text = m;
    }
    (window.VMRuntime?.alert || tg.showAlert)?.(text);
}

async function parseJsonResponse(response) {
    const raw = await response.text();
    if (!raw || !raw.trim()) return {};
    try {
        return JSON.parse(raw);
    } catch {
        const status = response.status;
        const body = raw.trim();
        if (status === 504 || /FUNCTION_INVOCATION_TIMEOUT|deployment.*timeout/i.test(body)) {
            throw new Error('Сервер не успел ответить (таймаут). Загляните в Дашборд — результат мог сохраниться в истории.');
        }
        if (/^\s*<!DOCTYPE|^\s*<html/i.test(body)) {
            if (status >= 500) {
                throw new Error(
                    `Сбой сервера (HTTP ${status}): пришла страница ошибки, а не JSON. Это обычно не ключ Gemini — смотрите логи Vercel → Functions → /api/generate.`,
                );
            }
            throw new Error(
                `Сервер вернул HTML (HTTP ${status}), а не JSON. Проверьте URL мини-приложения в BotFather (должен совпадать с Vercel, не старый ngrok).`,
            );
        }
        throw new Error(`Сервер вернул неверный ответ (HTTP ${status}). Попробуйте ещё раз.`);
    }
}

function setStudioGenerating(active, label) {
    const banner = document.getElementById('studio-generating-banner');
    const labelEl = document.getElementById('studio-generating-label');
    if (banner) banner.classList.toggle('hidden', !active);
    if (labelEl && label) labelEl.textContent = label;
    ['btn-generate', 'btn-generate-script', 'btn-generate-image'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.disabled = !!active;
    });
}

function saveActiveGenerationSession(kind, startedAt, seq) {
    try {
        localStorage.setItem(
            ACTIVE_GENERATION_KEY,
            JSON.stringify({ kind, startedAt, seq: Number(seq) || 0 }),
        );
    } catch (e) {
        /* ignore */
    }
}

function clearActiveGenerationSession() {
    try {
        localStorage.removeItem(ACTIVE_GENERATION_KEY);
    } catch (e) {
        /* ignore */
    }
}

function stopRecoveryPolling() {
    if (recoveryPollTimer) {
        clearInterval(recoveryPollTimer);
        recoveryPollTimer = null;
    }
    recoveryPollSeq = 0;
    recoveryPollAttempts = 0;
}

async function tryRecoverGenerationResultSince(kind, sinceAt) {
    try {
        const res = await fetch('/api/history', { headers: miniAppHeaders(false) });
        if (!res.ok) return false;
        const data = await parseJsonResponse(res);
        const items = Array.isArray(data.items) ? data.items : [];
        const latest = items.find((it) => it && Number(it.ts) >= sinceAt && it.type === kind);
        if (!latest) return false;
        if (kind === 'text' && !String(latest.text || '').trim()) return false;
        if (kind === 'image' && !latest.dataUrl) return false;
        openHistoryItem(latest);
        tg.showPopup({
            title: 'Результат готов',
            message: 'Ответ уже был на сервере — открыли последнюю генерацию из истории.',
        });
        return true;
    } catch {
        return false;
    }
}

function startRecoveryPolling(kind, seq, sinceAt) {
    stopRecoveryPolling();
    recoveryPollSeq = seq;
    recoveryPollAttempts = 0;
    recoveryPollTimer = setInterval(async () => {
        // Если запустили другую генерацию — не мешаем.
        if (seq !== activeGenerationSeq) {
            stopRecoveryPolling();
            return;
        }
        recoveryPollAttempts += 1;
        if (recoveryPollAttempts > RECOVERY_POLL_MAX_ATTEMPTS) {
            stopRecoveryPolling();
            return;
        }
        const ok = await tryRecoverGenerationResultSince(kind, sinceAt);
        if (ok) {
            stopRecoveryPolling();
            clearActiveGenerationSession();
            setStudioGenerating(false);
        }
    }, RECOVERY_POLL_INTERVAL_MS);
}

function beginGenerationSession(kind, opts = {}) {
    generationSeq += 1;
    const seq = generationSeq;
    activeGenerationSeq = seq;
    generationStartedAt = Date.now();
    saveActiveGenerationSession(kind, generationStartedAt, seq);
    let label = 'Генерируем текст… Обычно 30–90 секунд (несколько шагов AI). Не сворачивайте Telegram.';
    if (kind === 'image') {
        label = 'Создаём изображение… Обычно 20–90 секунд. Не сворачивайте Telegram.';
    } else if (opts.script) {
        label = 'Собираем сценарий… Хук, кадры и CTA. Обычно 30–90 секунд. Не сворачивайте Telegram.';
    }
    setStudioGenerating(true, label);
    startRecoveryPolling(kind, seq, generationStartedAt);
    return seq;
}

function endGenerationSession(seq) {
    if (seq !== activeGenerationSeq) return;
    setStudioGenerating(false);
    clearActiveGenerationSession();
    stopRecoveryPolling();
}

function revealResultContainer() {
    const rc = document.getElementById('result-container');
    if (!rc) return;
    rc.classList.remove('hidden');
    try {
        rc.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (e) { /* ignore */ }
}

async function tryRecoverGenerationResult(kind) {
    if (!generationStartedAt) return false;
    try {
        const res = await fetch('/api/history', { headers: miniAppHeaders(false) });
        if (!res.ok) return false;
        const data = await parseJsonResponse(res);
        const items = Array.isArray(data.items) ? data.items : [];
        const cutoff = generationStartedAt - 15000;
        const latest = items.find((it) => it && Number(it.ts) >= cutoff && it.type === kind);
        if (!latest) return false;
        if (kind === 'text' && !String(latest.text || '').trim()) return false;
        if (kind === 'image' && !latest.dataUrl) return false;
        openHistoryItem(latest);
        tg.showPopup({
            title: 'Результат готов',
            message: 'Ответ уже был на сервере — открыли последнюю генерацию из истории.',
        });
        return true;
    } catch {
        return false;
    }
}

function applyTextGenerateData(data, topic) {
    if (!data || !String(data.content || '').trim()) {
        throw new Error('Пустой ответ от сервера. Проверьте историю на дашборде.');
    }
    currentGeneratedText = data.content;
    currentGeneratedScore = data.viralScore;
    currentGeneratedMeta = {
        goal: data.goal || '',
        selectedAngle: data.selectedAngle || '',
        rewriteApplied: !!data.rewriteApplied,
        candidateCount: Number(data.candidateCount) || 0,
        criticScore: Number(data.criticScore) || 0,
        criticNeedsRewrite: !!data.criticNeedsRewrite,
        criticVerdict: data.criticVerdict || '',
        criticIssues: Array.isArray(data.criticIssues) ? data.criticIssues : [],
        criticStrengths: Array.isArray(data.criticStrengths) ? data.criticStrengths : [],
        criticBreakdown: data.criticBreakdown || {},
        risk: (studioRisk && studioRisk.value) || studioRiskLevel || DEFAULT_RISK,
        alternateAngle: data.alternateAngle || '',
        alternateScore: Number(data.alternateScore) || 0,
    };
    currentGeneratedCriticText = buildCriticText({
        criticVerdict: data.criticVerdict || '',
        criticIssues: Array.isArray(data.criticIssues) ? data.criticIssues : [],
        criticStrengths: Array.isArray(data.criticStrengths) ? data.criticStrengths : [],
        criticBreakdown: data.criticBreakdown || {},
    });
    currentAlternativeText = data.alternateContent || '';
    currentAlternativeScore = Number(data.alternateScore) || 0;
    currentAlternativeMeta = currentAlternativeText
        ? {
            goal: data.goal || '',
            selectedAngle: data.alternateAngle || '',
            rewriteApplied: false,
            candidateCount: Number(data.candidateCount) || 0,
            criticScore: null,
            risk: currentGeneratedMeta.risk,
        }
        : null;
    currentDisplayedVariant = 'A';
    currentImageDataUrl = '';
    currentImageDownloadUrl = '';
    currentImageDownloadToken = '';
    currentImageDownloadFileName = '';
    updateDashboardScore(currentGeneratedScore);
    renderTextResultView();
    revealResultContainer();
    document.getElementById('publish-status').classList.add('hidden');

    const historyEntry = appendHistoryEntry({
        ts: Number(data.historyTs) || Date.now(),
        type: 'text',
        topic: topic.slice(0, 240),
        text: currentGeneratedText,
        score: currentGeneratedScore,
        goal: data.goal || '',
        selectedAngle: data.selectedAngle || '',
        rewriteApplied: !!data.rewriteApplied,
        candidateCount: Number(data.candidateCount) || 0,
        criticScore: Number(data.criticScore) || 0,
        criticNeedsRewrite: !!data.criticNeedsRewrite,
        criticVerdict: data.criticVerdict || '',
        criticIssues: Array.isArray(data.criticIssues) ? data.criticIssues.slice(0, 4) : [],
        criticStrengths: Array.isArray(data.criticStrengths) ? data.criticStrengths.slice(0, 4) : [],
        criticBreakdown: data.criticBreakdown || {},
        risk: currentGeneratedMeta.risk,
        alternateText: data.alternateContent || '',
        alternateAngle: data.alternateAngle || '',
        alternateScore: Number(data.alternateScore) || 0,
    });
    syncCurrentHistoryFromItem(historyEntry || { ts: Date.now(), type: 'text' });
    if (document.getElementById('tab-dashboard').classList.contains('active')) loadDashboardData();
    return data;
}

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    const banner = document.getElementById('studio-generating-banner');
    if (!banner || banner.classList.contains('hidden')) return;
    const kind = studioMode === 'image' ? 'image' : 'text';
    tryRecoverGenerationResult(kind).then((ok) => {
        if (ok) endGenerationSession(activeGenerationSeq);
    });
});

async function recoverActiveGenerationOnLoad() {
    let saved = null;
    try {
        const raw = localStorage.getItem(ACTIVE_GENERATION_KEY);
        saved = raw ? JSON.parse(raw) : null;
    } catch (e) {
        saved = null;
    }
    if (!saved || !saved.startedAt || !saved.kind) return;

    const startedAt = Number(saved.startedAt);
    if (!Number.isFinite(startedAt)) return;
    const ageMs = Date.now() - startedAt;
    // Если генерация очень старая — это, скорее всего, просто остаток прошлого сеанса.
    if (ageMs > 10 * 60 * 1000) {
        clearActiveGenerationSession();
        return;
    }

    generationStartedAt = startedAt;
    const kind = saved.kind === 'image' ? 'image' : 'text';
    try {
        const ok = await tryRecoverGenerationResult(kind);
        setStudioGenerating(false);
        if (ok) clearActiveGenerationSession();
        else clearActiveGenerationSession();
    } catch (e) {
        setStudioGenerating(false);
        clearActiveGenerationSession();
    }
}

document.getElementById('mode-pill-text').addEventListener('click', () => setStudioMode('text'));
document.getElementById('mode-pill-script').addEventListener('click', () => setStudioMode('script'));
document.getElementById('mode-pill-image').addEventListener('click', () => setStudioMode('image'));

// --- Tab Navigation ---
function switchTab(tabId) {
    if (tabId !== 'settings' && window.SettingsHub) {
        SettingsHub.reset();
    }

    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));

    document.getElementById(`tab-${tabId}`).classList.add('active');

    document.querySelectorAll('.nav-item').forEach(nav => {
        if (nav.dataset.tab === tabId) {
            nav.classList.add('active');
        }
    });

    if (tabId === 'analytics' && window.VM && !VM.canAccessAnalytics()) {
        VM.syncAnalyticsGate();
    }

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
                ? item.dataUrl
                    ? `<div class="post-card-preview"><img src="${escapeHtml(item.dataUrl)}" alt="Превью картинки"></div>`
                    : `<div class="post-card-content text-muted">🖼 ${escapeHtml((item.prompt || '').slice(0, 140))}${(item.prompt || '').length > 140 ? '…' : ''}</div>`
                : `<div class="post-card-content">${escapeHtml((item.text || '').slice(0, 140))}${(item.text || '').length > 140 ? '…' : ''}</div>`;
            return `<div class="post-card clickable" data-history-key="${escapeHtml(historyItemKey(item))}"><div class="post-card-header"><span>${date}</span><span>${kind}</span></div>${preview}</div>`;
        }).join('');
        postsEl.querySelectorAll('.post-card.clickable').forEach((card) => {
            card.addEventListener('click', () => {
                const key = card.dataset.historyKey || '';
                const item = list.find((x) => historyItemKey(x) === key);
                if (item) openHistoryItem(item);
            });
        });
    }

    const textItems = list.filter((i) => i.type === 'text' && typeof i.score === 'number');
    updateDashboardScore(textItems.length ? textItems[0].score : null);
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

function openHistoryItem(item) {
    if (!item || typeof item !== 'object') return;
    if (window.VMHistory) item = window.VMHistory.hydrateHistoryItem(item);
    switchTab('studio');
    const resultContainer = document.getElementById('result-container');
    const resultText = document.getElementById('result-text');
    const resultImageWrap = document.getElementById('result-image-wrap');
    const resultImage = document.getElementById('result-image');
    const scoreWrap = document.getElementById('result-score-wrap');
    const scoreValue = document.getElementById('result-score');
    const actionsText = document.getElementById('result-actions-text');
    const actionsImage = document.getElementById('result-actions-image');
    const publishStatus = document.getElementById('publish-status');
    const resultMeta = document.getElementById('result-meta');
    const resultCritic = document.getElementById('result-critic');

    if (item.type === 'image') {
        syncCurrentHistoryFromItem(item);
        currentImageDataUrl = item.dataUrl || '';
        currentImageDownloadUrl = '';
        currentImageDownloadToken = '';
        currentImageDownloadFileName = '';
        currentGeneratedText = '';
        currentGeneratedScore = 0;
        currentGeneratedMeta = null;
        currentGeneratedCriticText = '';
        currentAlternativeText = '';
        currentAlternativeScore = 0;
        currentAlternativeMeta = null;
        currentDisplayedVariant = 'A';
        if (item.dataUrl && resultImage) {
            resultImage.src = item.dataUrl;
        }
        syncDownloadImageButton(!!item.dataUrl);
        if (resultText) resultText.classList.add('hidden');
        if (resultImageWrap) resultImageWrap.classList.remove('hidden');
        if (scoreWrap) scoreWrap.classList.add('hidden');
        if (actionsText) actionsText.classList.add('hidden');
        if (actionsImage) actionsImage.classList.remove('hidden');
        if (publishStatus) publishStatus.classList.add('hidden');
        if (resultMeta) {
            resultMeta.textContent = item.directorApplied ? 'Визуальный директор: активен · анти-повторы включены' : '';
            resultMeta.classList.toggle('hidden', !resultMeta.textContent);
        }
        if (resultCritic) {
            resultCritic.textContent = '';
            resultCritic.classList.add('hidden');
        }
        const variantBtn = document.getElementById('btn-toggle-variant');
        if (variantBtn) variantBtn.classList.add('hidden');
        if (resultContainer) resultContainer.classList.remove('hidden');
        trackHistoryFeedback({
            increments: { openedCount: 1 },
            set: { lastOpenedAt: Date.now(), lastOpenedType: 'image' },
        });
        return;
    }

    syncCurrentHistoryFromItem(item);
    currentGeneratedText = item.text || '';
    currentGeneratedScore = Number(item.score) || 0;
    currentGeneratedMeta = {
        goal: item.goal || '',
        selectedAngle: item.selectedAngle || '',
        rewriteApplied: !!item.rewriteApplied,
        candidateCount: Number(item.candidateCount) || 0,
        criticScore: Number(item.criticScore) || 0,
        criticVerdict: item.criticVerdict || '',
        criticIssues: Array.isArray(item.criticIssues) ? item.criticIssues : [],
        criticStrengths: Array.isArray(item.criticStrengths) ? item.criticStrengths : [],
        criticBreakdown: item.criticBreakdown || {},
        risk: item.risk || DEFAULT_RISK,
        alternateAngle: item.alternateAngle || '',
    };
    currentGeneratedCriticText = buildCriticText({
        criticVerdict: item.criticVerdict || '',
        criticIssues: Array.isArray(item.criticIssues) ? item.criticIssues : [],
        criticStrengths: Array.isArray(item.criticStrengths) ? item.criticStrengths : [],
        criticBreakdown: item.criticBreakdown || {},
    });
    currentAlternativeText = item.alternateText || '';
    currentAlternativeScore = Number(item.alternateScore) || 0;
    currentAlternativeMeta = item.alternateText
        ? {
            goal: item.goal || '',
            selectedAngle: item.alternateAngle || '',
            rewriteApplied: false,
            candidateCount: Number(item.candidateCount) || 0,
            criticScore: null,
            risk: item.risk || DEFAULT_RISK,
        }
        : null;
    currentDisplayedVariant = 'A';
    updateDashboardScore(currentGeneratedScore);
    renderTextResultView();
    if (resultText) {
        resultText.textContent = currentGeneratedText || (item.topic ? String(item.topic) : '');
    }
    if (resultImageWrap) resultImageWrap.classList.add('hidden');
    if (scoreWrap) scoreWrap.classList.remove('hidden');
    if (scoreValue) scoreValue.textContent = String(currentGeneratedScore);
    if (actionsText) actionsText.classList.remove('hidden');
    if (actionsImage) actionsImage.classList.add('hidden');
    if (publishStatus) publishStatus.classList.add('hidden');
    if (resultContainer) resultContainer.classList.remove('hidden');
    if (resultCritic) {
        resultCritic.textContent = currentGeneratedCriticText;
        resultCritic.classList.toggle('hidden', !currentGeneratedCriticText);
    }
    trackHistoryFeedback({
        increments: { openedCount: 1 },
        set: { lastOpenedAt: Date.now(), lastOpenedType: 'text' },
    });
}

function updateDashboardScore(score) {
    const el = document.getElementById('dashboard-score');
    if (!el) return;
    if (Number.isFinite(score)) {
        el.textContent = String(Math.max(0, Math.min(100, Math.round(score))));
        return;
    }
    el.textContent = '—';
}

function clearNode(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
}

function buildTrendPrompt(topic) {
    const topicText = String(topic || '').trim();
    const lower = topicText.toLowerCase();
    const platform = (studioPlatform && studioPlatform.value) || 'Telegram';
    const tone = (studioTone && studioTone.value) || 'вирусный';

    let angle = 'Сделай пост простым, конкретным и полезным.';
    let structure = 'Структура: 1) сильный хук 2) 3 коротких тезиса 3) вывод 4) CTA.';

    if (lower.includes('лайфстайл') || lower.includes('lifestyle')) {
        angle = 'Сделай пост как заметку из жизни: привычки, день из жизни, маленькая победа или честная ошибка.';
        structure = 'Структура: 1) хук про личный опыт 2) 3 бытовых наблюдения 3) короткий вывод 4) CTA с вопросом.';
    } else if (lower.includes('ai') || lower.includes('нейросеть') || lower.includes('chatgpt')) {
        angle = 'Покажи практическую пользу AI: проблема -> решение -> пример -> что делать дальше.';
    } else if (lower.includes('крипт') || lower.includes('bitcoin') || lower.includes('биткоин')) {
        angle = 'Сделай пост с ощущением упущенной возможности или инсайта, но без перегруза терминами.';
    } else if (lower.includes('финанс') || lower.includes('деньги')) {
        angle = 'Сделай пост про деньги через простой личный вывод, цифры и понятный совет.';
    } else if (lower.includes('продуктив')) {
        angle = 'Сделай пост про продуктивность через один полезный приём, который можно применить сегодня.';
    }

    return [
        `Сгенерируй пост для ${platform} на тему "${topicText}".`,
        `Тон: ${tone}.`,
        angle,
        structure,
        'Сделай текст живым, без канцелярита, и закончи коротким CTA.',
    ].join('\n');
}

// --- Dashboard & Analytics: сервер (KV) + кэш в localStorage ---
async function loadDashboardData() {
    let list = null;
    try {
        const res = await fetch('/api/history', { headers: miniAppHeaders(false) });
        if (res.ok) {
            const data = await res.json().catch(() => ({}));
            if (Array.isArray(data.items)) {
                const localList = readHistoryCache();
                list = mergeHistoryLists(data.items, localList);
                try {
                    const toStore = window.VMHistory
                        ? window.VMHistory.prepareListForStorage(list.slice(0, 40))
                        : list.slice(0, 40);
                    localStorage.setItem(HISTORY_KEY, JSON.stringify(toStore));
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
/**
 * Показывает owner-only секции настроек.
 * Источник истины — isOwner с GET /api/user (сервер сравнивает с OWNER_TELEGRAM_IDS).
 * Блок «Тестовый доступ» скрыт от обычных пользователей: debug-активация тарифов без оплаты.
 * Клиент не сверяет telegram id локально — только флаг с API; сами endpoint'ы защищены adminAccess.
 */
function applyOwnerOnlySections(isOwnerFromServer) {
    const show = Boolean(isOwnerFromServer);
    ['owner-test-access', 'admin-tools-panel'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('hidden', !show);
    });
}

async function loadUserData(options = {}) {
    const { silent = false } = options;
    try {
        const response = await fetch('/api/user', { headers: miniAppHeaders(false) });
        const data = await response.json().catch(() => ({}));
        if (response.status === 401 || response.status === 503) {
            const msg = data.message || data.error || 'Проверьте настройки сервера (KV, Telegram).';
            console.warn('loadUserData:', response.status, msg);
            if (response.status === 401) {
                if (window.VMRuntime?.isWeb && window.VMWebAuth) {
                    window.VMWebAuth.showOverlay();
                } else if (!silent) {
                    (window.VMRuntime?.alert || tg.showAlert)?.(
                        'Откройте приложение из Telegram, чтобы загрузить профиль.',
                    );
                }
            } else if (!silent) {
                (window.VMRuntime?.alert || tg.showAlert)?.(msg);
            }
            return;
        }
        if (data && data.plan) {
            userPlan = data.plan;
            if (window.VM) {
                VM.updatePlan(data.plan);
                VM.updateFeatures(data.features);
                const hadStored = sessionStorage.getItem('vm_last_bonus_gen') !== null;
                const prevBonus = Number(sessionStorage.getItem('vm_last_bonus_gen') || '0');
                const nextBonus = Number(data.bonusGenerations) || 0;
                if (!silent && hadStored && nextBonus > prevBonus) {
                    VM.showReferralBonusToast(prevBonus, nextBonus);
                }
                sessionStorage.setItem('vm_last_bonus_gen', String(nextBonus));
            }
            updatePlanUI(data.plan, data.planUntil || null, data.bonusGenerations || 0, data.quotaRemaining);
        }
        applyOwnerOnlySections(Boolean(data?.isOwner));
        if (data && data.profile) {
            document.getElementById('profile-niche').value = data.profile.niche || '';
            document.getElementById('profile-language').value = data.profile.language || '';
            document.getElementById('profile-style').value = data.profile.styleNote || '';
            document.getElementById('profile-brand-memory').value = data.profile.brandMemory || '';
        }
        if (data && data.referral && window.ReferralSystem) {
            ReferralSystem.renderStats(data.referral, data.userId);
            if (!silent && data.referral.unseenRewards?.length) {
                await ReferralSystem.handleUnseenRewards(data.referral.unseenRewards, miniAppHeaders);
                await loadUserData({ silent: true });
            }
        }
        if (data?.referralSignup?.bound && !silent) {
            tg.showPopup({
                title: 'Реферальная ссылка активна',
                message:
                    'Вы перешли по приглашению. После вашей первой генерации друг получит +10 бонусных генераций.',
            });
        }
        if (data?.supportChatLink) {
            supportChatLink = data.supportChatLink;
        }
    } catch (error) {
        console.error('Error loading user data:', error);
    }
}

document.addEventListener('visibilitychange', () => {
    if (document.hidden || window.VMRuntime?.isWeb) return;
    loadUserData({ silent: true });
});

window.addEventListener('focus', () => {
    if (window.VMRuntime?.isWeb) return;
    loadUserData({ silent: true });
});

document.getElementById('btn-save-profile').addEventListener('click', async () => {
    const niche = document.getElementById('profile-niche').value.trim();
    const language = document.getElementById('profile-language').value.trim();
    const styleNote = document.getElementById('profile-style').value.trim();
    const brandMemory = document.getElementById('profile-brand-memory').value.trim();
    try {
        const response = await fetch('/api/user', {
            method: 'POST',
            headers: miniAppHeaders(true),
            body: JSON.stringify({ niche, language, styleNote, brandMemory }),
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

function updatePlanUI(plan, planUntil, bonusGenerations = 0, quotaRemaining = null) {
    const badge = document.getElementById('current-plan-badge');
    const upgradeBtn = document.getElementById('btn-upgrade-pro');
    const quotaValue = document.getElementById('settings-quota-value');
    const quotaLabel = document.getElementById('settings-quota-label');
    const heroPlan = document.getElementById('settings-hero-plan-badge');

    if (plan === 'pro' || plan === 'premium') {
        badge.className = 'plan-badge plan-pro';
        let untilLine = '';
        let untilShort = '';
        if (planUntil) {
            try {
                const d = new Date(planUntil);
                if (!Number.isNaN(d.getTime())) {
                    untilLine = ` · до ${d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })}`;
                    untilShort = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
                }
            } catch (e) { /* ignore */ }
        }
        badge.innerHTML =
            plan === 'premium'
                ? `Premium · картинки в канал${untilLine} ✨`
                : `Pro · безлимит${untilLine} ✨`;
        if (upgradeBtn) upgradeBtn.classList.add('hidden');
        if (quotaValue) quotaValue.textContent = '∞';
        if (quotaLabel) quotaLabel.textContent = untilShort ? `до ${untilShort}` : 'безлимит';
        if (heroPlan) {
            heroPlan.textContent = plan === 'premium' ? 'PREMIUM' : 'PRO';
            heroPlan.className = 'settings-hero-plan settings-hero-plan-paid';
        }
    } else {
        badge.className = 'plan-badge plan-free';
        const bonusLine = bonusGenerations > 0 ? ` · +${bonusGenerations} бонус` : '';
        const remainLine =
            quotaRemaining != null && Number.isFinite(quotaRemaining)
                ? ` · осталось ${quotaRemaining}`
                : '';
        badge.innerHTML = `Free · 5 бесплатных${bonusLine}${remainLine}`;
        if (upgradeBtn) upgradeBtn.classList.remove('hidden');
        const remaining = quotaRemaining != null && Number.isFinite(quotaRemaining) ? quotaRemaining : 5;
        if (quotaValue) quotaValue.textContent = String(remaining);
        if (quotaLabel) {
            quotaLabel.textContent = bonusGenerations > 0
                ? `из 5 · +${bonusGenerations} бонус`
                : 'из 5 ⚡';
        }
        if (heroPlan) {
            heroPlan.textContent = 'FREE';
            heroPlan.className = 'settings-hero-plan settings-hero-plan-free';
        }
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
        const response = await fetch('/api/manual-plan', {
            method: 'POST',
            headers: {
                ...miniAppHeaders(true),
                'X-Debug-Secret': secret.trim(),
            },
            body: JSON.stringify({ action: 'debug', plan }),
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
    const secretInput = document.getElementById('manual-secret');
    const statusEl = document.getElementById('manual-activate-status');
    const target = targetInput ? targetInput.value.trim() : '';
    if (!target) {
        tg.showAlert('Введите @username или userId.');
        return;
    }

    const secret = secretInput ? secretInput.value.trim() : '';
    if (!secret) {
        if (statusEl) statusEl.textContent = 'Введите DEBUG_ADMIN_SECRET в поле ниже @username/userId.';
        tg.showAlert('Введите DEBUG_ADMIN_SECRET в поле ниже @username/userId.');
        return;
    }

    if (statusEl) statusEl.textContent = 'Активирую тариф...';

    try {
        const response = await fetch('/api/manual-plan', {
            method: 'POST',
            headers: {
                ...miniAppHeaders(true),
                'X-Debug-Secret': secret,
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

function getCleanupSecret() {
    const cleanupInput = document.getElementById('cleanup-secret');
    const manualInput = document.getElementById('manual-secret');
    const cleanupSecret = cleanupInput ? cleanupInput.value.trim() : '';
    if (cleanupSecret) return cleanupSecret;
    return manualInput ? manualInput.value.trim() : '';
}

function renderCleanupList(items) {
    void items;
    // legacy noop — UI moved to AdminSubs
}

async function loadCleanupPlans() {
    const statusEl = document.getElementById('cleanup-status');
    const secret = getCleanupSecret();
    if (!secret) {
        if (statusEl) statusEl.textContent = 'Введите DEBUG_ADMIN_SECRET в поле выше.';
        tg.showAlert('Введите DEBUG_ADMIN_SECRET в поле выше.');
        return;
    }

    if (statusEl) statusEl.textContent = 'Загружаю подписки...';

    try {
        const response = await fetch('/api/manual-plan?action=list', {
            method: 'GET',
            headers: {
                ...miniAppHeaders(false),
                'X-Debug-Secret': secret,
            },
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            const message = data.message || data.error || 'Не удалось получить список.';
            if (statusEl) statusEl.textContent = message;
            tg.showAlert(message);
            return;
        }

        const overview = data.overview || {
            active: Array.isArray(data.items) ? data.items : [],
            expired: [],
            freeUsers: [],
            totals: {
                active: Array.isArray(data.items) ? data.items.length : 0,
                expired: 0,
                freeUsers: 0,
            },
        };

        if (window.AdminSubs) {
            AdminSubs.renderOverview(overview);
        }

        const t = overview.totals || {};
        if (statusEl) {
            statusEl.textContent =
                `В базе: ${t.totalUsers || 0} · 30 дн: ${t.activeLast30Days || 0} · Подписки: ${t.active || 0}/${t.expired || 0} · Free: ${t.freeUsers || 0}`;
        }
    } catch (error) {
        console.error('Cleanup list error:', error);
        if (statusEl) statusEl.textContent = 'Ошибка при загрузке списка.';
        tg.showAlert('Ошибка при загрузке подписок.');
    }
}

async function resetCleanupPlan(userId, username = '') {
    const statusEl = document.getElementById('cleanup-status');
    const secret = getCleanupSecret();
    if (!secret) {
        if (statusEl) statusEl.textContent = 'Введите DEBUG_ADMIN_SECRET в поле выше.';
        tg.showAlert('Введите DEBUG_ADMIN_SECRET в поле выше.');
        return;
    }

    const label = username ? `@${username}` : userId;
    const confirmed = window.confirm(`Сбросить подписку пользователя ${label} в Free?`);
    if (!confirmed) return;

    if (statusEl) statusEl.textContent = `Сбрасываю ${label}...`;

    try {
        const response = await fetch('/api/manual-plan', {
            method: 'POST',
            headers: {
                ...miniAppHeaders(true),
                'X-Debug-Secret': secret,
            },
            body: JSON.stringify({ action: 'reset', target: userId }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            const message = data.message || data.error || 'Не удалось сбросить тариф.';
            if (statusEl) statusEl.textContent = message;
            tg.showAlert(message);
            return;
        }

        if (statusEl) statusEl.textContent = `Пользователь ${label} сброшен в Free.`;
        tg.showPopup({
            title: 'Готово',
            message: `Тариф пользователя ${label} сброшен в Free.`,
            buttons: [{ type: 'ok' }],
        });
        await loadCleanupPlans();
        await loadUserData({ silent: true });
    } catch (error) {
        console.error('Cleanup reset error:', error);
        if (statusEl) statusEl.textContent = 'Ошибка при сбросе тарифа.';
        tg.showAlert('Ошибка при сбросе тарифа.');
    }
}

window.resetCleanupPlan = resetCleanupPlan;

document.getElementById('plan-pro').addEventListener('click', () => buyPlan('pro'));
document.getElementById('plan-premium').addEventListener('click', () => buyPlan('premium'));
document.getElementById('btn-open-premiumbot').addEventListener('click', handlePremiumBotAction);
document.getElementById('btn-contact-support')?.addEventListener('click', openSupportChat);
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

document.getElementById('btn-upgrade-pro')?.addEventListener('click', () => {
    if (window.SettingsHub) {
        switchTab('settings');
        SettingsHub.openPanel('subscription');
        return;
    }
    buyPlan('pro');
});

document.getElementById('btn-debug-pro').addEventListener('click', () => activateDebugPlan('pro'));
document.getElementById('btn-debug-premium').addEventListener('click', () => activateDebugPlan('premium'));
document.getElementById('btn-manual-pro').addEventListener('click', () => activateManualPlan('pro'));
document.getElementById('btn-manual-premium').addEventListener('click', () => activateManualPlan('premium'));
document.getElementById('btn-cleanup-load').addEventListener('click', () => loadCleanupPlans());
document.getElementById('btn-cleanup-clear').addEventListener('click', () => {
    const statusEl = document.getElementById('cleanup-status');
    if (window.AdminSubs) AdminSubs.hideDashboard();
    if (statusEl) statusEl.textContent = '';
});

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
    setStudioIntent('auto');
    const prompt = buildTrendPrompt(topic);
    const topicInput = document.getElementById('studio-topic');
    if (topicInput) {
        topicInput.value = prompt;
        topicInput.focus();
        topicInput.setSelectionRange(prompt.length, prompt.length);
    }
    const hint = document.getElementById('studio-trend-hint');
    if (hint) {
        hint.textContent = `Готовый запрос для «${topic}». Можете отредактировать его перед генерацией.`;
    }
    switchTab('studio');
}

function buildRefinePrompt(mode, sourceText) {
    const base = String(sourceText || '').trim();
    const platform = studioPlatform.value;
    const tone = studioTone.value;
    const map = {
        concrete: 'Перепиши текст так, чтобы стало больше конкретики, пользы, деталей и сильнее хук.',
        shorter: 'Перепиши текст короче, плотнее и динамичнее. Убери всё лишнее.',
        lively: 'Перепиши текст живее, теплее и человечнее. Меньше общих фраз, больше энергии.',
        expert: 'Перепиши текст более экспертно и убедительно, но всё ещё понятно и без занудства.',
    };
    return [
        map[mode] || 'Перепиши текст лучше.',
        `Платформа: ${platform}.`,
        `Тон: ${tone}.`,
        'Вот исходный текст:',
        base,
    ].join('\n');
}

function runRefine(mode) {
    if (!currentGeneratedText.trim()) {
        tg.showAlert('Сначала сгенерируйте текст.');
        return;
    }
    const topicInput = document.getElementById('studio-topic');
    if (!topicInput) return;
    topicInput.value = buildRefinePrompt(mode, currentGeneratedText);
    setStudioIntent('auto');
    document.getElementById('btn-generate').click();
}

// --- Content Generation ---
async function runTextGeneration(opts = {}) {
    const topic = document.getElementById('studio-topic').value.trim();
    const platform = opts.platform ?? studioPlatform.value;
    const tone = opts.tone ?? studioTone.value;
    const risk = (studioRisk && studioRisk.value) || studioRiskLevel || DEFAULT_RISK;
    const model = settingsModel.value || 'gemini-2.5-flash';
    const scriptDuration = opts.scriptDuration;
    const scriptFormat = opts.scriptFormat;

    const limitMsg = document.getElementById('limit-msg');
    limitMsg.classList.add('hidden');

    if (!topic) {
        tg.showAlert(opts.emptyTopicMessage || 'Пожалуйста, введите тему или идею.');
        return;
    }

    const btnId = opts.buttonId || 'btn-generate';
    const btn = document.getElementById(btnId);
    const originalText = btn ? btn.textContent : '';
    const seq = beginGenerationSession('text', { script: scriptDuration != null });

    try {
        const response = await fetch('/api/generate', {
            method: 'POST',
            headers: miniAppHeaders(true),
            body: JSON.stringify({
                topic,
                platform,
                tone,
                risk,
                model,
                intent: studioIntent,
                ...(scriptDuration != null ? { scriptDuration } : {}),
                ...(scriptFormat ? { scriptFormat } : {}),
            }),
        });

        const data = await parseJsonResponse(response);

        if (response.status === 403 && data.error === 'limit_reached') {
            limitMsg.innerHTML = `⚡️ Бесплатные генерации закончились. Пригласите друзей за бонус или <a href="javascript:void(0)" onclick="openSettingsPanel('subscription')">перейдите на Pro →</a>`;
            limitMsg.classList.remove('hidden');
            limitMsg.classList.add('error');
            return;
        }

        if (!response.ok) {
            const errText = typeof data?.error === 'string' ? data.error : '';
            throw new Error(data?.message || errText || `Ошибка генерации (${response.status})`);
        }

        applyTextGenerateData(data, topic);

        if (data.remainingToday !== undefined) {
            const remaining = data.remainingToday;
            if (remaining <= 2) {
                limitMsg.innerHTML = `⚡️ Осталось бесплатных генераций: <b>${remaining}</b>.`;
                limitMsg.classList.remove('hidden', 'error');
                limitMsg.classList.add('warning');
            }
        }
    } catch (error) {
        console.error(error);
        const recovered = await tryRecoverGenerationResult('text');
        if (!recovered) alertFromGenerateError(error.message);
    } finally {
        endGenerationSession(seq);
        if (btn) btn.textContent = originalText;
    }
}

document.getElementById('btn-generate').addEventListener('click', () => runTextGeneration());

document.getElementById('btn-generate-script').addEventListener('click', () => {
    const scriptPlatform = document.getElementById('script-platform');
    const scriptDuration = document.getElementById('script-duration');
    const scriptFormat = document.getElementById('script-format');
    const scriptTone = document.getElementById('script-tone');
    runTextGeneration({
        platform: scriptPlatform ? scriptPlatform.value : 'Reels / Shorts (сценарий)',
        tone: scriptTone ? scriptTone.value : studioTone.value,
        scriptDuration: scriptDuration ? scriptDuration.value : '30',
        scriptFormat: scriptFormat ? scriptFormat.value : 'mixed',
        buttonId: 'btn-generate-script',
        emptyTopicMessage: 'Введите тему ролика.',
    });
});

async function runImageGeneration() {
    const prompt = document.getElementById('studio-topic').value.trim();
    const aspectRatio = imageAspect.value;
    const style = imageStyle.value;
    const risk = (studioRisk && studioRisk.value) || studioRiskLevel || DEFAULT_RISK;

    const limitMsg = document.getElementById('limit-msg');
    limitMsg.classList.add('hidden');

    if (!prompt) {
        tg.showAlert('Введите описание изображения.');
        return;
    }

    const btn = document.getElementById('btn-generate-image');
    const originalText = btn.textContent;
    const seq = beginGenerationSession('image');

    try {
        const response = await fetch('/api/generate-image', {
            method: 'POST',
            headers: miniAppHeaders(true),
            body: JSON.stringify({ prompt, aspectRatio, style, risk }),
        });

        const data = await parseJsonResponse(response);

        if (response.status === 403 && data.error === 'limit_reached') {
            limitMsg.innerHTML = `⚡️ Бесплатные генерации закончились. Пригласите друзей за бонус или <a href="javascript:void(0)" onclick="openSettingsPanel('subscription')">перейдите на Pro →</a>`;
            limitMsg.classList.remove('hidden');
            limitMsg.classList.add('error');
            return;
        }

        if (!response.ok) {
            const errText = typeof data?.error === 'string' ? data.error : '';
            throw new Error(data?.message || errText || `Ошибка (${response.status})`);
        }
        if (!data.dataUrl) {
            throw new Error('Пустой ответ (нет картинки). Проверьте историю на дашборде.');
        }

        currentImageDataUrl = data.dataUrl;
        currentImageDownloadUrl = data.downloadUrl || '';
        currentImageDownloadToken = data.downloadToken || '';
        currentImageDownloadFileName = data.downloadFileName || '';
        currentGeneratedText = '';
        currentGeneratedScore = 0;
        currentGeneratedMeta = null;
        currentGeneratedCriticText = '';
        currentAlternativeText = '';
        currentAlternativeScore = 0;
        currentAlternativeMeta = null;
        currentDisplayedVariant = 'A';
        document.getElementById('result-image').src = data.dataUrl;
        syncDownloadImageButton(true);

        document.getElementById('result-text').classList.add('hidden');
        document.getElementById('result-image-wrap').classList.remove('hidden');
        document.getElementById('result-score-wrap').classList.add('hidden');
        document.getElementById('result-actions-text').classList.add('hidden');
        document.getElementById('result-refine-text').classList.add('hidden');
        document.getElementById('result-actions-image').classList.remove('hidden');
        const resultMeta = document.getElementById('result-meta');
        if (resultMeta) {
            resultMeta.textContent = data.directorApplied
                ? 'Промпт уточнён · для сохранения нажмите «Сохранить в галерею»'
                : 'Готово · «Сохранить в галерею» отправит фото в чат с ботом';
            resultMeta.classList.remove('hidden');
        }
        const resultCritic = document.getElementById('result-critic');
        if (resultCritic) {
            resultCritic.textContent = '';
            resultCritic.classList.add('hidden');
        }
        const variantBtn = document.getElementById('btn-toggle-variant');
        if (variantBtn) variantBtn.classList.add('hidden');

        revealResultContainer();
        document.getElementById('publish-status').classList.add('hidden');

        const imageTs = Number(data.historyTs) || Date.now();
        const historyEntry = appendHistoryEntry({
            ts: imageTs,
            type: 'image',
            prompt: prompt.slice(0, 240),
            dataUrl: data.dataUrl,
            mimeType: data.mimeType,
            directorApplied: !!data.directorApplied,
            risk,
        });
        syncCurrentHistoryFromItem(
            historyEntry || {
                ts: imageTs,
                type: 'image',
                prompt: prompt.slice(0, 240),
                dataUrl: data.dataUrl,
                mimeType: data.mimeType,
            },
        );
        if (document.getElementById('tab-dashboard').classList.contains('active')) loadDashboardData();

        if (data.remainingToday !== undefined) {
            const remaining = data.remainingToday;
            if (remaining <= 2) {
                limitMsg.innerHTML = `⚡️ Осталось бесплатных генераций: <b>${remaining}</b>.`;
                limitMsg.classList.remove('hidden', 'error');
                limitMsg.classList.add('warning');
            }
        }
    } catch (error) {
        console.error(error);
        const recovered = await tryRecoverGenerationResult('image');
        if (!recovered) alertFromGenerateError(error.message);
    } finally {
        endGenerationSession(seq);
        btn.textContent = originalText;
    }
}

document.getElementById('btn-generate-image').addEventListener('click', () => runImageGeneration());
document.getElementById('btn-remake-image').addEventListener('click', () => {
    trackHistoryFeedback({
        increments: { remakeCount: 1 },
        set: { lastRemadeAt: Date.now(), lastRemadeType: 'image' },
    });
    runImageGeneration();
});

// --- Studio Actions ---
document.getElementById('btn-copy').addEventListener('click', () => {
    navigator.clipboard.writeText(currentGeneratedText).then(() => {
        trackHistoryFeedback({
            increments: { copiedCount: 1 },
            set: { lastCopiedAt: Date.now(), lastCopiedVariant: currentDisplayedVariant },
        });
        tg.showPopup({ title: 'Скопировано', message: 'Текст скопирован в буфер обмена.' });
    });
});

document.getElementById('btn-remake').addEventListener('click', () => {
    trackHistoryFeedback({
        increments: { remakeCount: 1 },
        set: { lastRemadeAt: Date.now(), lastRemadeType: 'text' },
    });
    document.getElementById('btn-generate').click();
});
document.getElementById('btn-toggle-variant').addEventListener('click', () => {
    activateTextVariant(currentDisplayedVariant === 'A' ? 'B' : 'A');
    trackHistoryFeedback({
        increments: currentDisplayedVariant === 'B' ? { variantBCount: 1 } : { variantACount: 1 },
        set: { lastVariantViewedAt: Date.now(), preferredVariant: currentDisplayedVariant },
    });
});
document.getElementById('btn-refine-concrete').addEventListener('click', () => runRefine('concrete'));
document.getElementById('btn-refine-shorter').addEventListener('click', () => runRefine('shorter'));
document.getElementById('btn-refine-lively').addEventListener('click', () => runRefine('lively'));
document.getElementById('btn-refine-expert').addEventListener('click', () => runRefine('expert'));

document.getElementById('btn-publish').addEventListener('click', async () => {
    const channel = normalizeChannelInput(settingsChannel.value);
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
            trackHistoryFeedback({
                increments: { publishCount: 1 },
                set: { lastPublishedAt: Date.now(), lastPublishedVariant: currentDisplayedVariant, lastPublishedChannel: channel },
            });
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

document.getElementById('btn-publish-image').addEventListener('click', async () => {
    const channel = normalizeChannelInput(settingsChannel.value);
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
            trackHistoryFeedback({
                increments: { publishCount: 1 },
                set: { lastPublishedAt: Date.now(), lastPublishedChannel: channel },
            });
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

document.getElementById('btn-download-image').addEventListener('click', () => {
    saveCurrentImageToDevice();
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
if (window.VMOnboarding) VMOnboarding.mount();
if (window.ReferralSystem) ReferralSystem.mount();
if (window.AdminSubs) AdminSubs.mount();
document.getElementById('btn-analytics-upgrade')?.addEventListener('click', () => buyPlan('pro'));
updatePlanUI('free', null);
recoverActiveGenerationOnLoad();
async function bootApp() {
    if (window.VMTelegramBoot?.isInsideTelegramClient?.() || window.Telegram?.WebApp) {
        await window.VMTelegramBoot?.waitForInitData?.(8000);
    }
    window.VMRuntime?.syncTelegramChrome?.();

    if (window.VMRuntime?.isWeb && window.VMWebAuth) {
        try {
            await window.VMWebAuth.ensureSession();
        } catch (e) {
            console.warn('web auth:', e);
            return;
        }
    }
    await loadUserData();
    if (window.VMOnboarding && !VMOnboarding.isDone()) {
        setTimeout(() => VMOnboarding.show(), 400);
    }
    if (window.VMImageDownload?.readPendingSaveToken?.()) {
        setTimeout(() => {
            VMImageDownload.retryPendingSaveIfAny({
                tg: getTg(),
                getHeaders: () => miniAppHeaders(true),
            });
        }, 800);
    }
}
bootApp();
const SettingsHub = (function initSettingsHub() {
    const hubView = document.getElementById('settings-hub-view');
    const moreRow = document.getElementById('settings-hub-more');
    const moreTile = document.querySelector('[data-settings-action="toggle-more"]');
    const panels = document.querySelectorAll('.settings-panel');
    let activePanel = null;

    function setTileActive(panelId) {
        document.querySelectorAll('[data-settings-panel]').forEach((tile) => {
            tile.classList.toggle('active', tile.dataset.settingsPanel === panelId);
        });
    }

    function openPanel(panelId) {
        if (!hubView || !panelId) return;
        activePanel = panelId;
        hubView.classList.add('hidden');
        panels.forEach((panel) => {
            panel.classList.toggle('hidden', panel.dataset.panel !== panelId);
        });
        setTileActive(panelId);
        const panelEl = document.getElementById(`settings-panel-${panelId}`);
        if (panelEl) panelEl.scrollTop = 0;
        const tab = document.getElementById('tab-settings');
        if (tab) {
            tab.scrollTop = 0;
            tab.classList.add('settings-panel-open');
        }
    }

    function reset() {
        activePanel = null;
        if (hubView) hubView.classList.remove('hidden');
        document.getElementById('tab-settings')?.classList.remove('settings-panel-open');
        panels.forEach((panel) => panel.classList.add('hidden'));
        document.querySelectorAll('[data-settings-panel]').forEach((tile) => tile.classList.remove('active'));
        if (moreRow) moreRow.classList.add('hidden');
        if (moreTile) {
            moreTile.classList.remove('is-expanded');
            moreTile.setAttribute('aria-expanded', 'false');
        }
    }

    document.querySelectorAll('[data-settings-panel]').forEach((tile) => {
        tile.addEventListener('click', () => {
            const panelId = tile.dataset.settingsPanel;
            if (panelId) openPanel(panelId);
        });
    });

    moreTile?.addEventListener('click', () => {
        if (!moreRow) return;
        moreRow.classList.toggle('hidden');
        const isOpen = !moreRow.classList.contains('hidden');
        moreTile.classList.toggle('is-expanded', isOpen);
        moreTile.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });

    document.querySelectorAll('[data-settings-back]').forEach((btn) => {
        btn.addEventListener('click', reset);
    });

    return { openPanel, reset, getActivePanel: () => activePanel };
})();

window.SettingsHub = SettingsHub;

function openSettingsPanel(panelId) {
    switchTab('settings');
    SettingsHub.openPanel(panelId);
}

window.openSettingsPanel = openSettingsPanel;

loadTrends();
loadDashboardData();
