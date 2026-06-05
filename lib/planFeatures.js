const { isPaidTierActive } = require('./kvUserStore');

/** Активная платная подписка Pro или Premium. */
function hasActivePaidPlan(rec) {
  if (!rec) return false;
  return isPaidTierActive(rec) && (rec.plan === 'pro' || rec.plan === 'premium');
}

/** Аналитика Viral Score — только Pro/Premium с активной подпиской. */
function canAccessAnalytics(rec) {
  return hasActivePaidPlan(rec);
}

/** Публикация фото в канал — только активный Premium. */
function canPublishImageToChannel(rec, options = {}) {
  const { allowFileDevLegacy = false } = options;
  if (!rec || rec.plan !== 'premium') return false;
  if (allowFileDevLegacy && !rec.planUntil) return true;
  return isPaidTierActive(rec);
}

/** Маркетингово-честное описание возможностей тарифа. */
function planFeatureSummary(rec) {
  const paid = hasActivePaidPlan(rec);
  const premium = canPublishImageToChannel(rec);
  return {
    dailyLimit: paid ? null : 5,
    freeGenerationLimit: paid ? null : 5,
    unlimitedGenerations: paid,
    analytics: canAccessAnalytics(rec),
    publishImageToChannel: premium,
    publishTextToChannel: true,
    aiCandidates: rec?.plan === 'premium' ? 3 : rec?.plan === 'pro' ? 2 : 1,
    rateLimitMultiplier: rec?.plan === 'premium' ? 2 : 1,
  };
}

module.exports = {
  hasActivePaidPlan,
  canAccessAnalytics,
  canPublishImageToChannel,
  planFeatureSummary,
};
