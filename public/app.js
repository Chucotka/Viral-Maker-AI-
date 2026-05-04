// Initialize Telegram Web App
const tg = window.Telegram.WebApp;
tg.expand();
tg.ready();

// Set user name if available
let userId = 'anonymous';
if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
    document.getElementById('user-name').textContent = tg.initDataUnsafe.user.first_name;
    userId = tg.initDataUnsafe.user.id.toString();
}

// Global state
let currentGeneratedText = '';
let currentGeneratedScore = 0;
let studioMode = 'text';
let currentImageDataUrl = '';

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
        ta.placeholder = 'Например: Как использовать AI для бизнеса в 2024 году...';
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
    } else if (/API[_ ]?key|401|403|PERMISSION_DENIED|invalid api/i.test(m)) {
        text = 'Проблема с ключом или доступом к API. Проверьте GEMINI_API_KEY на сервере.';
    } else if (/404|not found for API version|no longer available|ListModels/i.test(m)) {
        text = 'Модель недоступна для вашего ключа. Обновите приложение или проверьте доступ в Google AI Studio.';
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

    // Update nav highlighting based on onclick attribute string matching
    document.querySelectorAll('.nav-item').forEach(nav => {
        if (nav.getAttribute('onclick').includes(tabId)) {
            nav.classList.add('active');
        }
    });

    if (tabId === 'dashboard' || tabId === 'analytics') {
        loadDashboardData();
    }
}

// --- Dashboard & Analytics Data ---
// In this MVP structure, the backend no longer returns history.
// We will clear out the frontend representation gracefully.
async function loadDashboardData() {
    document.getElementById('recent-posts-list').innerHTML = '<p class="text-muted">История пуста.</p>';
    document.getElementById('stat-total').textContent = '0';
    document.getElementById('stat-avg').textContent = '0';
    document.getElementById('top-post-card').innerHTML = '<p class="text-muted">Нет данных</p>';
    document.getElementById('analytics-chart').innerHTML = '';
}

// --- User Data ---
async function loadUserData() {
    try {
        const response = await fetch(`/api/user?userId=${userId}`);
        const data = await response.json();
        if (data) {
            updatePlanUI(data.plan);
        }
    } catch (error) {
        console.error('Error loading user data:', error);
    }
}

function updatePlanUI(plan) {
    const badge = document.getElementById('current-plan-badge');
    const upgradeBtn = document.getElementById('btn-upgrade-pro');

    if (plan === 'pro') {
        badge.className = 'plan-badge plan-pro';
        badge.innerHTML = 'Pro · Безлимит ✨';
        upgradeBtn.classList.add('hidden');
    } else {
        badge.className = 'plan-badge plan-free';
        badge.innerHTML = 'Free · 5 генераций/день';
        upgradeBtn.classList.remove('hidden');
    }
}

async function buyPlan(plan) {
    try {
        const response = await fetch('/api/create-invoice', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, plan })
        });
        const data = await response.json();
        if (data.link) {
            tg.openInvoice(data.link, (status) => {
                if (status === 'paid') {
                    tg.showAlert('✨ Спасибо за покупку! Ваша подписка активирована.');
                    loadUserData();
                } else if (status === 'failed') {
                    tg.showAlert('❌ Ошибка оплаты.');
                }
            });
        }
    } catch (error) {
        console.error('Payment error:', error);
        tg.showAlert('Произошла ошибка при создании счета.');
    }
}

document.getElementById('plan-pro').addEventListener('click', () => buyPlan('pro'));
document.getElementById('plan-premium').addEventListener('click', () => buyPlan('premium'));

document.getElementById('btn-upgrade-pro').addEventListener('click', () => {
    buyPlan('pro');
});

// --- Trends Data ---
async function loadTrends() {
    try {
        const response = await fetch('/api/trends');
        const data = await response.json();

        // Update Dashboard Strip
        const strip = document.getElementById('dashboard-trends');
        strip.innerHTML = data.trends.map(t => `
            <div class="trend-chip" onclick="prefillStudio('${t.name}')">${t.emoji} ${t.name}</div>
        `).join('');

        // Update Explorer Grid
        const grid = document.getElementById('trends-grid');
        grid.innerHTML = data.trends.map(t => `
            <div class="trend-item" onclick="prefillStudio('${t.name}')">
                <div class="trend-emoji">${t.emoji}</div>
                <div class="trend-name">${t.name}</div>
                <div class="trend-score">Score: ${t.score}</div>
            </div>
        `).join('');

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
    const platform = document.getElementById('studio-platform').value;
    const tone = document.getElementById('studio-tone').value;
    const model = document.getElementById('settings-model').value || 'gemini-2.5-flash';

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
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ topic, platform, tone, model, userId })
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
            throw new Error(errText || `Ошибка генерации (${response.status})`);
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
    const aspectRatio = document.getElementById('image-aspect').value;
    const style = document.getElementById('image-style').value;

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
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt, aspectRatio, style, userId }),
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
            throw new Error(errText || `Ошибка (${response.status})`);
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
    const channel = document.getElementById('settings-channel').value.trim();
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
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: currentGeneratedText, channelUsername: channel })
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

// Trend Search Filter
document.getElementById('trend-search').addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const items = document.querySelectorAll('#trends-grid .trend-item');
    items.forEach(item => {
        const name = item.querySelector('.trend-name').textContent.toLowerCase();
        if (name.includes(term)) {
            item.style.display = 'block';
        } else {
            item.style.display = 'none';
        }
    });
});

// Init
loadUserData();
loadTrends();
loadDashboardData();
