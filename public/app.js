// Initialize Telegram Web App
const tg = window.Telegram.WebApp;
tg.expand();
tg.ready();

// Set user name if available
if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
    document.getElementById('user-name').textContent = tg.initDataUnsafe.user.first_name;
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
async function loadDashboardData() {
    try {
        const response = await fetch('/api/generate/history');
        const data = await response.json();
        const posts = data.posts || [];

        // Update Dashboard
        const postsList = document.getElementById('recent-posts-list');
        if (posts.length === 0) {
            postsList.innerHTML = '<p class="text-muted">История пуста.</p>';
        } else {
            postsList.innerHTML = posts.slice(0, 3).map(post => `
                <div class="post-card">
                    <div class="post-card-header">
                        <span>${post.platform} • ${post.tone}</span>
                        <span style="color: var(--warning)">🔥 ${post.viralScore}</span>
                    </div>
                    <div class="post-card-content">${post.content}</div>
                </div>
            `).join('');

            // Set latest score as dashboard score
            document.getElementById('dashboard-score').textContent = posts[0].viralScore;
        }

        // Update Analytics
        document.getElementById('stat-total').textContent = posts.length;

        if (posts.length > 0) {
            const avgScore = Math.round(posts.reduce((acc, p) => acc + p.viralScore, 0) / posts.length);
            document.getElementById('stat-avg').textContent = avgScore;

            const topPost = posts.reduce((prev, current) => (prev.viralScore > current.viralScore) ? prev : current);
            document.getElementById('top-post-card').innerHTML = `
                <div class="post-card-header">
                    <span>🔥 ${topPost.viralScore} Score</span>
                </div>
                <div class="post-card-content">${topPost.content}</div>
            `;

            // Simple Chart (last 7 posts for simplicity)
            const chartData = posts.slice(0, 7).reverse();
            const chartContainer = document.getElementById('analytics-chart');
            chartContainer.innerHTML = chartData.map((p, i) => `
                <div class="chart-bar-wrapper">
                    <div class="chart-bar" style="height: ${p.viralScore}%"></div>
                    <span class="chart-label">${i+1}</span>
                </div>
            `).join('');
        }

    } catch (error) {
        console.error('Error loading history:', error);
    }
}

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
    const model = document.getElementById('settings-model').value || 'gpt-4o';

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
            body: JSON.stringify({ topic, platform, tone, model })
        });

        if (!response.ok) throw new Error('Ошибка генерации');

        const data = await response.json();

        currentGeneratedText = data.content;
        currentGeneratedScore = data.viralScore;

        document.getElementById('result-text').textContent = currentGeneratedText;
        document.getElementById('result-score').textContent = currentGeneratedScore;

        document.getElementById('result-container').classList.remove('hidden');
        document.getElementById('publish-status').classList.add('hidden');

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
            body: JSON.stringify({ text: currentGeneratedText, channel })
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
loadTrends();
loadDashboardData();
