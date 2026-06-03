/**
 * Admin — наглядная панель подписок (активные / истёкшие / Free).
 */
(function initAdminSubs(global) {
  const tg = global.Telegram?.WebApp;

  let currentTab = 'active';
  let lastOverview = null;

  function qs(id) {
    return document.getElementById(id);
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatDate(iso) {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return '—';
      return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch {
      return '—';
    }
  }

  function daysRemaining(iso) {
    if (!iso) return null;
    const ms = new Date(iso).getTime() - Date.now();
    if (!Number.isFinite(ms)) return null;
    return Math.max(0, Math.ceil(ms / 86400000));
  }

  function planBadgeClass(plan) {
    return plan === 'premium' ? 'subs-badge-premium' : plan === 'pro' ? 'subs-badge-pro' : 'subs-badge-free';
  }

  function planLabel(plan) {
    if (plan === 'premium') return 'Premium';
    if (plan === 'pro') return 'Pro';
    return 'Free';
  }

  function avatarLetter(item) {
    const u = item.telegramUsername || item.userId || '?';
    return String(u).replace(/^@+/, '').charAt(0).toUpperCase() || '?';
  }

  function renderCard(item) {
    const username = item.telegramUsername ? `@${escapeHtml(item.telegramUsername)}` : 'без username';
    const plan = item.plan === 'premium' ? 'premium' : item.plan === 'pro' ? 'pro' : 'free';
    const until = formatDate(item.planUntil);
    const days = item.status === 'active' ? daysRemaining(item.planUntil) : null;
    const daysChip =
      days != null && item.status === 'active'
        ? `<span class="subs-days-chip">${days} дн.</span>`
        : item.status === 'expired'
          ? `<span class="subs-days-chip subs-days-chip-muted">истекла</span>`
          : '';

    const metaExtra =
      item.status === 'free'
        ? `Генераций сегодня: ${item.dailyCount || 0}${item.bonusGenerations ? ` · бонус: ${item.bonusGenerations}` : ''}`
        : item.referralCount
          ? `Рефералов: ${item.referralCount}`
          : '';

    const resetBtn =
      item.status === 'active'
        ? `<button type="button" class="btn btn-secondary btn-inline subs-reset-btn" data-user-id="${escapeHtml(item.userId)}" data-username="${escapeHtml(item.telegramUsername || '')}">Сбросить</button>`
        : '';

    return `
      <article class="subs-card subs-card-${item.status}">
        <div class="subs-card-left">
          <div class="subs-avatar" aria-hidden="true">${escapeHtml(avatarLetter(item))}</div>
          <div class="subs-card-body">
            <div class="subs-card-top">
              <div class="subs-card-name">${username}</div>
              <span class="subs-badge ${planBadgeClass(plan)}">${planLabel(plan)}</span>
            </div>
            <div class="subs-card-id">ID: <code>${escapeHtml(item.userId)}</code></div>
            <div class="subs-card-meta">
              ${item.status === 'free' ? metaExtra : `До: <b>${escapeHtml(until)}</b> ${daysChip}`}
              ${item.status !== 'free' && metaExtra ? `<span class="subs-meta-sep">·</span> ${metaExtra}` : ''}
            </div>
          </div>
        </div>
        ${resetBtn}
      </article>
    `;
  }

  function renderList(items, emptyText) {
    if (!Array.isArray(items) || !items.length) {
      return `<div class="subs-empty">${emptyText}</div>`;
    }
    return `<div class="subs-cards">${items.map(renderCard).join('')}</div>`;
  }

  function updateStats(totals) {
    const t = totals || { active: 0, expired: 0, freeUsers: 0 };
    const set = (id, val) => {
      const el = qs(id);
      if (el) el.textContent = String(val);
    };
    set('subs-count-active', t.active);
    set('subs-count-expired', t.expired);
    set('subs-count-free', t.freeUsers);
  }

  function renderPanel() {
    if (!lastOverview) return;
    const panels = {
      active: { el: 'subs-panel-active', items: lastOverview.active, empty: 'Нет активных Pro/Premium подписок.' },
      expired: { el: 'subs-panel-expired', items: lastOverview.expired, empty: 'Истёкших подписок пока нет в базе.' },
      free: { el: 'subs-panel-free', items: lastOverview.freeUsers, empty: 'Free-пользователи с @username не найдены.' },
    };
    Object.entries(panels).forEach(([key, cfg]) => {
      const el = qs(cfg.el);
      if (el) el.innerHTML = renderList(cfg.items, cfg.empty);
    });

    document.querySelectorAll('[data-subs-tab]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.subsTab === currentTab);
    });
    document.querySelectorAll('.subs-panel').forEach((panel) => {
      panel.classList.toggle('hidden', panel.id !== `subs-panel-${currentTab}`);
    });

    bindResetButtons();
  }

  function bindResetButtons() {
    document.querySelectorAll('.subs-reset-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (typeof global.resetCleanupPlan === 'function') {
          global.resetCleanupPlan(btn.dataset.userId, btn.dataset.username || '');
        }
      });
    });
  }

  function showDashboard() {
    const dash = qs('subs-dashboard');
    if (dash) dash.classList.remove('hidden');
  }

  function hideDashboard() {
    const dash = qs('subs-dashboard');
    if (dash) dash.classList.add('hidden');
    lastOverview = null;
  }

  function renderOverview(overview) {
    lastOverview = overview;
    updateStats(overview.totals);
    showDashboard();
    renderPanel();
  }

  function setTab(tab) {
    currentTab = tab;
    renderPanel();
  }

  function mount() {
    document.querySelectorAll('[data-subs-tab]').forEach((btn) => {
      btn.addEventListener('click', () => setTab(btn.dataset.subsTab));
    });

    const statTabs = [
      ['subs-stat-active', 'active'],
      ['subs-stat-expired', 'expired'],
      ['subs-stat-free', 'free'],
    ];
    statTabs.forEach(([className, tab]) => {
      document.querySelectorAll(`.${className}`).forEach((el) => {
        el.classList.add('subs-stat-clickable');
        el.setAttribute('role', 'button');
        el.setAttribute('tabindex', '0');
        el.addEventListener('click', () => setTab(tab));
        el.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setTab(tab);
          }
        });
      });
    });
  }

  global.AdminSubs = {
    mount,
    renderOverview,
    hideDashboard,
    setTab,
    getOverview: () => lastOverview,
  };
})(window);
