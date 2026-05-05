const { isPaidTierActive } = require('./kvUserStore');

/** Публикация фото в канал — только активный Premium (автовизуал в канале). */
function canPublishImageToChannel(rec, options = {}) {
  const { allowFileDevLegacy = false } = options;
  if (!rec || rec.plan !== 'premium') return false;
  if (allowFileDevLegacy && !rec.planUntil) return true;
  return isPaidTierActive(rec);
}

module.exports = { canPublishImageToChannel };
