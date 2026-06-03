/**
 * VM Core — общие утилиты и gating аналитики.
 */
(function initVmCore(global) {
  const tg = global.Telegram?.WebApp;

  const VM = {
    userPlan: 'free',
    features: {},
    canAccessAnalytics() {
      return Boolean(VM.features?.analytics);
    },
    updateFeatures(features) {
      VM.features = features && typeof features === 'object' ? features : {};
      VM.syncAnalyticsGate();
    },
    updatePlan(plan) {
      VM.userPlan = plan || 'free';
      VM.syncAnalyticsGate();
    },
    syncAnalyticsGate() {
      const upsell = document.getElementById('analytics-upsell');
      const content = document.getElementById('analytics-content');
      const allowed = VM.canAccessAnalytics();
      if (upsell) upsell.classList.toggle('hidden', allowed);
      if (content) content.classList.toggle('hidden', !allowed);
    },
    showReferralBonusToast(prevBonus, nextBonus) {
      const prev = Number(prevBonus) || 0;
      const next = Number(nextBonus) || 0;
      if (next <= prev) return;
      const gained = next - prev;
      tg?.showPopup?.({
        title: 'Реферальный бонус ⚡',
        message: `+${gained} бонусных генераций начислено! Всего в запасе: ${next}.`,
      });
    },
  };

  global.VM = VM;
})(window);
