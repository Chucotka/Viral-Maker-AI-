/**
 * ReferralSystem — клиентский модуль реферальной программы.
 * Аналог React-компонента ReferralSystem.tsx для Vanilla JS Mini App.
 */
(function initReferralSystem(global) {
  const tg = global.Telegram?.WebApp;

  let currentStats = null;
  let currentUserId = null;

  /** Читает start_param из Telegram initData или URL (?startapp=). */
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

  function formatShareText(link) {
    return `⚡ Создавай вирусный контент с AI — Viral Maker AI!\n\nПерейди по ссылке и получи бесплатные генерации:\n${link}`;
  }

  /** Обновляет все блоки статистики на странице. */
  function renderStats(stats, userId) {
    currentStats = stats;
    currentUserId = userId;

    const count = stats?.referralCount || 0;
    const bonus = stats?.bonusGenerations || 0;
    const totalReward = stats?.totalReferralReward || 0;
    const progress = stats?.progressPercent ?? 0;
    const next = stats?.nextMilestone;

    document.querySelectorAll('[data-ref-count]').forEach((el) => {
      el.textContent = String(count);
    });
    document.querySelectorAll('[data-ref-bonus]').forEach((el) => {
      el.textContent = String(bonus);
    });
    document.querySelectorAll('[data-ref-total-reward]').forEach((el) => {
      el.textContent = String(totalReward);
    });
    document.querySelectorAll('[data-ref-progress]').forEach((el) => {
      el.style.width = `${Math.min(100, Math.max(0, progress))}%`;
    });
    document.querySelectorAll('[data-ref-progress-label]').forEach((el) => {
      if (!next) {
        el.textContent = 'Все milestone-награды получены! 🎉';
        return;
      }
      el.textContent = `${count} / ${next.target} друзей · осталось ${next.remaining} до «${next.reward}»`;
    });

    document.querySelectorAll('[data-ref-milestone-5]').forEach((el) => {
      el.classList.toggle('ref-milestone-done', Boolean(stats?.referralMilestone5));
    });
    document.querySelectorAll('[data-ref-milestone-10]').forEach((el) => {
      el.classList.toggle('ref-milestone-done', Boolean(stats?.referralMilestone10));
    });
  }

  /** Шаринг реферальной ссылки через Telegram. */
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

  /** Модальное окно поздравления с milestone. */
  function showMilestoneModal(reward) {
    const overlay = qs('referral-reward-modal');
    const title = qs('referral-reward-title');
    const body = qs('referral-reward-body');
    const icon = qs('referral-reward-icon');
    if (!overlay || !title || !body) return;

    const milestone = Number(reward?.milestone) || 0;
    const proDays = Number(reward?.proDays) || 0;

    icon.textContent = milestone >= 10 ? '🏆' : '⚡';
    title.textContent = milestone >= 10 ? '10 друзей — легенда!' : '5 друзей — Pro unlocked!';
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

  /** Подтверждает просмотр наград на сервере. */
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

  /** Обрабатывает unseenRewards из ответа /api/user. */
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

  /** Привязка кнопок «Пригласить друзей». */
  function bindInviteButtons() {
    document.querySelectorAll('[data-ref-invite]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (currentStats) shareReferralLink(currentStats);
      });
    });
  }

  function mount() {
    bindInviteButtons();
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
  };
})(window);
