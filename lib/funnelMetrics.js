const { getRedisClient, isKvConfigured } = require('./redisClient');

const ALLOWED_STAGES = new Set([
  'app_open',
  'studio_open',
  'guest_session',
  'telegram_session',
  'generation_completed',
  'limit_one_left',
  'paywall_shown',
  'checkout_click',
  'landing_go',
]);

function dayBucketUtc(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function funnelKey(day, stage) {
  return `vm:funnel:${day}:${stage}`;
}

function isAllowedStage(stage) {
  return ALLOWED_STAGES.has(String(stage || '').trim());
}

async function trackFunnelStage(stage, props = {}) {
  const name = String(stage || '').trim();
  if (!isAllowedStage(name)) return { ok: false, error: 'invalid_stage' };
  if (!isKvConfigured()) return { ok: true, skipped: true };

  const kv = getRedisClient();
  if (!kv) return { ok: true, skipped: true };

  const day = dayBucketUtc();
  const key = funnelKey(day, name);
  try {
    const n = await kv.incr(key);
    if (n === 1) await kv.expire(key, 86400 * 45);
    if (props && props.source) {
      const srcKey = `${key}:src:${String(props.source).slice(0, 32)}`;
      await kv.incr(srcKey);
      if (n === 1) await kv.expire(srcKey, 86400 * 45);
    }
    return { ok: true };
  } catch (e) {
    console.error('trackFunnelStage:', e.message);
    return { ok: false, error: e.message };
  }
}

async function getFunnelSnapshot(days = 7) {
  if (!isKvConfigured()) return { days: [], totals: {} };
  const kv = getRedisClient();
  if (!kv) return { days: [], totals: {} };

  const span = Math.min(Math.max(Number(days) || 7, 1), 30);
  const totals = {};
  const rows = [];

  for (let i = 0; i < span; i += 1) {
    const d = new Date(Date.now() - i * 86400000);
    const day = dayBucketUtc(d);
    const stages = {};
    for (const stage of ALLOWED_STAGES) {
      const val = Number(await kv.get(funnelKey(day, stage))) || 0;
      if (val > 0) {
        stages[stage] = val;
        totals[stage] = (totals[stage] || 0) + val;
      }
    }
    rows.push({ day, stages });
  }

  return { days: rows.reverse(), totals };
}

module.exports = {
  ALLOWED_STAGES,
  isAllowedStage,
  trackFunnelStage,
  getFunnelSnapshot,
  funnelKey,
};
