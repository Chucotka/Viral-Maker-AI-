/**
 * ReferralSystem — клиентский модуль реферальной программы.
 * Тексты наград синхронизированы с lib/referralService.js (BONUS_PER_REFERRAL, MILESTONE_*).
 */
(function initReferralSystem(global) {
  const tg = global.Telegram?.WebApp;

  /** Подсказка об антифрод-правиле — показываем под заголовком и внизу блока. */
  const REFERRAL_RULE_HINT = 'Друг засчитывается после первой генерации';

  /** Уровни наград для UI (compact + full). */
  const REFERRAL_REWARDS = [
    {
      id: 'per_friend',
      icon: '⚡',
      threshold: 1,
      compactTitle: 'За друга',
      compactReward: '+10 генераций',
      fullTitle: 'За каждого друга',
      fullReward: '+10 генераций',
      fullDesc: 'Бонус начисляется сразу после первой генерации приглашённого.',
      kind: 'repeat',
    },
    {
      id: 'milestone_5',
      icon: '🎯',
      threshold: 5,
      compactTitle: '5 друзей',
      compactReward: '+1 день Pro',
      fullTitle: '5 подтверждённых друзей',
      fullReward: '+1 день Pro',
      fullDesc: 'Pro безлимит на сутки — все генерации без ограничений.',
      kind: 'milestone',
      milestoneKey: 'referralMilestone5',
    },
    {
      id: 'milestone_10',
      icon: '👑',
      threshold: 10,
      compactTitle: '10 друзей',
      compactReward: '+7 дней Pro',
      fullTitle: '10 подтверждённых друзей',
      fullReward: '+7 дней Pro',
      fullDesc: 'Неделя Pro — максимум возможностей студии.',
      kind: 'milestone',
      milestoneKey: 'referralMilestone10',
    },
  ];

  const MILESTONE_5 = 5;
  const MILESTONE_10 = 10;

  let currentStats = null;
  let currentUserId = null;
  let lastRenderedCount = null;

  function readStartParam() {
    const fromTg = tg?.initDataUnsafe?.start_param;
    if (fromTg && String(fromTg).trim()) return String(fromTg).trim();
    try {
      const url = new URL(global.location.href);
      const fromUrl = url.searchParams.get('startapp') || url.searchParams.get('start_param');
      if (fromUrl && fromUrl.trim()) return fromUrl.trim();
    } catch (_) {
      /* ignore */
    }
    return null;
  }

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

  function formatShareText(link) {
    return `⚡ Создавай вирусный контент с AI — Viral Maker AI!\n\nПерейди по ссылке и получи бесплатные генерации:\n${link}`;
  }

  /** Состояние tier-карточки: permanent | done | next | upcoming */
  function resolveTierState(tier, count, stats) {
    if (tier.kind === 'repeat') {
      return count > 0 ? 'done' : 'next';
    }
    const done = Boolean(stats?.[tier.milestoneKey]) || count >= tier.threshold;
    if (done) return 'done';
    const nextTarget =
      count < MILESTONE_5 ? MILESTONE_5 : count < MILESTONE_10 ? MILESTONE_10 : null;
    if (nextTarget === tier.threshold) return 'next';
    return 'upcoming';
  }

  function tierStateClass(state) {
    if (state === 'done') return 'is-done';
    if (state === 'next') return 'is-next';
    if (state === 'permanent') return 'is-permanent';
    return '';
  }

  /** HTML одной tier-карточки (compact или full). */
  function renderTierCard(tier, state, mode) {
    const cls = ['referral-tier', `referral-tier-${mode}`, tierStateClass(state)].filter(Boolean).join(' ');
    if (mode === 'compact') {
      return `
        <div class="${cls}" data-ref-tier="${escapeHtml(tier.id)}">
          <span class="referral-tier-icon" aria-hidden="true">${tier.icon}</span>
          <span class="referral-tier-title">${escapeHtml(tier.compactTitle)}</span>
          <strong class="referral-tier-reward">${escapeHtml(tier.compactReward)}</strong>
        </div>
      `;
    }
    return `
      <div class="${cls}" data-ref-tier="${escapeHtml(tier.id)}">
        <div class="referral-tier-head">
          <span class="referral-tier-icon" aria-hidden="true">${tier.icon}</span>
          <div>
            <div class="referral-tier-title">${escapeHtml(tier.fullTitle)}</div>
            <strong class="referral-tier-reward">${escapeHtml(tier.fullReward)}</strong>
          </div>
        </div>
        <p class="referral-tier-desc">${escapeHtml(tier.fullDesc)}</p>
      </div>
    `;
  }

  /** Рендер сетки наград в контейнеры [data-ref-tiers="compact|full"]. */
  function renderRewardTiers(stats) {
    const count = stats?.referralCount || 0;
    document.querySelectorAll('[data-ref-tiers]').forEach((container) => {
      const mode = container.dataset.refTiers === 'full' ? 'full' : 'compact';
      container.innerHTML = REFERRAL_REWARDS.map((tier) => {
        const state = tier.kind === 'repeat' ? 'permanent' : resolveTierState(tier, count, stats);
        return renderTierCard(tier, state, mode);
      }).join('');
    });

    // Анимация при росте счётчика друзей
    if (lastRenderedCount != null && count > lastRenderedCount) {
      document.querySelectorAll('.referral-tier.is-next, .referral-tier.is-done').forEach((el) => {
        el.classList.remove('referral-tier-pop');
        void el.offsetWidth;
        el.classList.add('referral-tier-pop');
      });
    }
    lastRenderedCount = count;
  }

  /** Цифры: друзья, бонус-ген, всего заработано. */
  function renderStatsNumbers(stats) {
    const count = stats?.referralCount || 0;
    const bonus = stats?.bonusGenerations || 0;
    const totalReward = stats?.totalReferralReward || 0;

    document.querySelectorAll('[data-ref-count]').forEach((el) => {
      el.textContent = String(count);
    });
    document.querySelectorAll('[data-ref-bonus]').forEach((el) => {
      el.textContent = String(bonus);
    });
    document.querySelectorAll('[data-ref-total-reward]').forEach((el) => {
      el.textContent = String(totalReward);
    });
  }

  /**
   * Сегментированный прогресс 0 → 5 → 10.
   * Первая половина шкалы — путь до +1 дня Pro, вторая — до +7 дней Pro.
   */
  function computeProgress(count) {
    if (count >= MILESTONE_10) {
      return {
        fillPercent: 100,
        label: 'Все награды получены! 🏆',
        segment: 'complete',
      };
    }
    if (count < MILESTONE_5) {
      const remaining = MILESTONE_5 - count;
      return {
        fillPercent: (count / MILESTONE_5) * 50,
        label: `${count} / ${MILESTONE_5} друзей · ещё ${remaining} до +1 дня Pro`,
        segment: 'to5',
      };
    }
    const remaining = MILESTONE_10 - count;
    return {
      fillPercent: 50 + ((count - MILESTONE_5) / (MILESTONE_10 - MILESTONE_5)) * 50,
      label: `${count} / ${MILESTONE_10} друзей · ещё ${remaining} до +7 дней Pro`,
      segment: 'to10',
    };
  }

  /** Прогресс-бар + маркеры milestone + подпись. */
  function renderProgressTrack(stats) {
    const count = stats?.referralCount || 0;
    const { fillPercent, label, segment } = computeProgress(count);

    document.querySelectorAll('[data-ref-progress]').forEach((el) => {
      el.style.width = `${Math.min(100, Math.max(0, fillPercent))}%`;
      el.dataset.refSegment = segment;
    });
    document.querySelectorAll('[data-ref-progress-label]').forEach((el) => {
      el.textContent = label;
    });
    document.querySelectorAll('[data-ref-progress-root]').forEach((root) => {
      root.dataset.refSegment = segment;
      root.querySelectorAll('[data-ref-marker]').forEach((marker) => {
        const m = Number(marker.dataset.refMarker);
        marker.classList.toggle('is-reached', count >= m);
        marker.classList.toggle('is-current', segment === 'to5' && m === MILESTONE_5 && count < MILESTONE_5
          || segment === 'to10' && m === MILESTONE_10 && count < MILESTONE_10);
      });
    });
  }

  /**
   * Лента активности — заготовка под push/toast.
   * Пока показываем превью непросмотренных наград из unseenRewards.
   */
  function renderActivityFeed(stats) {
    const unseen = Array.isArray(stats?.unseenRewards) ? stats.unseenRewards : [];
    document.querySelectorAll('[data-ref-activity-feed]').forEach((feed) => {
      if (!unseen.length) {
        feed.classList.add('hidden');
        feed.innerHTML = '';
        return;
      }
      feed.classList.remove('hidden');
      const items = unseen
        .map((r) => {
          if (r.kind === 'milestone') {
            const days = Number(r.proDays) || 0;
            return `<li class="referral-feed-item">🎁 Milestone ${r.milestone}: +${days} ${days === 1 ? 'день' : 'дней'} Pro</li>`;
          }
          return `<li class="referral-feed-item">🎁 Новая реферальная награда</li>`;
        })
        .join('');
      feed.innerHTML = `
        <div class="referral-feed-banner">
          <span class="referral-feed-icon" aria-hidden="true">🔔</span>
          <div>
            <div class="referral-feed-title">Новые награды</div>
            <ul class="referral-feed-list">${items}</ul>
          </div>
        </div>
      `;
    });
  }

  /** Подсказка об правиле засчитывания друга. */
  function renderRuleHints() {
    document.querySelectorAll('[data-ref-rule-hint]').forEach((el) => {
      el.textContent = REFERRAL_RULE_HINT;
    });
  }

  /** Главная точка входа — обновляет все блоки на странице. */
  function renderStats(stats, userId) {
    currentStats = stats;
    currentUserId = userId;
    renderRuleHints();
    renderStatsNumbers(stats);
    renderRewardTiers(stats);
    renderProgressTrack(stats);
    renderActivityFeed(stats);
  }

  function shareReferralLink(stats) {
    const links = stats?.links;
    if (!links?.telegramLink) {
      tg?.showAlert?.('Ссылка пока недоступна. Попробуйте позже.');
      return;
    }
    const shareUrl = links.telegramLink;
    const text = encodeURIComponent(formatShareText(shareUrl));
    const sharePath = `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${text}`;

    if (tg?.openTelegramLink) {
      tg.openTelegramLink(sharePath);
    } else if (tg?.openLink) {
      tg.openLink(sharePath);
    } else {
      global.open(sharePath, '_blank', 'noopener');
    }

    tg?.HapticFeedback?.impactOccurred?.('medium');
  }

  function showMilestoneModal(reward) {
    const overlay = qs('referral-reward-modal');
    const title = qs('referral-reward-title');
    const body = qs('referral-reward-body');
    const icon = qs('referral-reward-icon');
    if (!overlay || !title || !body) return;

    const milestone = Number(reward?.milestone) || 0;
    const proDays = Number(reward?.proDays) || 0;

    icon.textContent = milestone >= 10 ? '👑' : '🎯';
    title.textContent = milestone >= 10 ? '10 друзей — корона Pro!' : '5 друзей — Pro unlocked!';
    body.innerHTML =
      `Поздравляем! Вы пригласили <b>${milestone} друзей</b> и получили ` +
      `<span class="ref-neon-text">+${proDays} ${proDays === 1 ? 'день' : 'дней'} Pro</span> ` +
      `и <span class="ref-neon-text">+10 бонусных генераций</span> за последнего друга.`;

    overlay.classList.remove('hidden');
    overlay.classList.add('ref-modal-visible');
    tg?.HapticFeedback?.notificationOccurred?.('success');

    const burst = overlay.querySelector('.ref-confetti-burst');
    if (burst) {
      burst.classList.remove('ref-animate');
      void burst.offsetWidth;
      burst.classList.add('ref-animate');
    }
  }

  function hideMilestoneModal() {
    const overlay = qs('referral-reward-modal');
    if (!overlay) return;
    overlay.classList.add('hidden');
    overlay.classList.remove('ref-modal-visible');
  }

  async function ackRewards(milestones, miniAppHeaders) {
    if (!milestones?.length || typeof miniAppHeaders !== 'function') return;
    try {
      await fetch('/api/user', {
        method: 'POST',
        headers: miniAppHeaders(true),
        body: JSON.stringify({ ackReferralRewards: milestones }),
      });
    } catch (e) {
      console.warn('ackReferralRewards failed', e);
    }
  }

  async function handleUnseenRewards(rewards, miniAppHeaders) {
    if (!Array.isArray(rewards) || !rewards.length) return;

    for (const reward of rewards) {
      if (reward?.kind === 'milestone') {
        showMilestoneModal(reward);
        await new Promise((resolve) => {
          const btn = qs('referral-reward-close');
          const handler = async () => {
            btn?.removeEventListener('click', handler);
            hideMilestoneModal();
            resolve();
          };
          btn?.addEventListener('click', handler);
        });
      }
    }

    const milestones = rewards.filter((r) => r.kind === 'milestone').map((r) => r.milestone);
    await ackRewards(milestones, miniAppHeaders);
  }

  function bindInviteButtons() {
    document.querySelectorAll('[data-ref-invite]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (currentStats) shareReferralLink(currentStats);
      });
    });
  }

  function mount() {
    bindInviteButtons();
    renderRuleHints();
    const closeBtn = qs('referral-reward-close');
    closeBtn?.addEventListener('click', hideMilestoneModal);
  }

  global.ReferralSystem = {
    readStartParam,
    renderStats,
    shareReferralLink,
    showMilestoneModal,
    handleUnseenRewards,
    mount,
    getStats: () => currentStats,
    REFERRAL_REWARDS,
    REFERRAL_RULE_HINT,
  };
})(window);
