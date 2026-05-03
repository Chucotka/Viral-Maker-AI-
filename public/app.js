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
    document.getElementById('studio-topic').value = topic;
    switchTab('studio');
}

// --- Content Generation ---
document.getElementById('btn-generate').addEventListener('click', async () => {
    const topic = document.getElementById('studio-topic').value.trim();
    const platform = document.getElementById('studio-platform').value;
    const tone = document.getElementById('studio-tone').value;
    const model = document.getElementById('settings-model').value || 'gemini-1.5-flash';

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

        if (!response.ok) throw new Error('Ошибка генерации');

        currentGeneratedText = data.content;
        currentGeneratedScore = data.viralScore;

        document.getElementById('result-text').textContent = currentGeneratedText;
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
        tg.showAlert('Произошла ошибка при генерации. Проверьте API ключ.');
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
});

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
