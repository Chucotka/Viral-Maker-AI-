const { isKvConfigured } = require('./kvUserStore');

function isKvConfiguredFromEnv(env = process.env) {
  const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL || '';
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN || '';
  return Boolean(url && token);
}

/** Снимок состояния сервисов для /api/health и мониторинга. */
function buildHealthStatus(env = process.env) {
  const redis = env === process.env ? isKvConfigured() : isKvConfiguredFromEnv(env);
  const checks = {
    ok: redis && Boolean(env.GEMINI_API_KEY) && Boolean(env.TELEGRAM_BOT_TOKEN),
    redis,
    gemini: Boolean(env.GEMINI_API_KEY),
    gemini_proxy: Boolean(
      env.GEMINI_HTTPS_PROXY || env.GEMINI_PROXY || env.HTTPS_PROXY,
    ),
    bot: Boolean(env.TELEGRAM_BOT_TOKEN),
    tribute: Boolean(env.TRIBUTE_API_KEY),
    session: Boolean(env.SESSION_SECRET || env.DEBUG_ADMIN_SECRET),
    webapp_url: env.WEBAPP_URL || null,
    tribute_webhook_url: env.WEBAPP_URL
      ? `${String(env.WEBAPP_URL).replace(/\/$/, '')}/api/tribute-webhook`
      : null,
    ts: new Date().toISOString(),
  };
  return checks;
}

function listHealthIssues(checks) {
  const issues = [];
  if (!checks.redis) issues.push('redis');
  if (!checks.gemini) issues.push('gemini_key');
  if (!checks.bot) issues.push('telegram_bot');
  if (!checks.session) issues.push('session_secret');
  if (!checks.gemini_proxy) issues.push('gemini_proxy');
  return issues;
}

function formatHealthAlertMessage(checks, opts = {}) {
  const issues = listHealthIssues(checks);
  const critical = issues.filter((i) => i !== 'gemini_proxy');
  const lines = [
    opts.recovered ? '✅ <b>Viral Maker AI — сервисы восстановлены</b>' : '⚠️ <b>Viral Maker AI — проблема на сервере</b>',
    '',
    `Время: ${checks.ts}`,
    `OK: ${checks.ok ? 'да' : 'нет'}`,
    `Redis: ${checks.redis ? '✓' : '✗'}`,
    `Gemini: ${checks.gemini ? '✓' : '✗'}`,
    `Прокси Gemini: ${checks.gemini_proxy ? '✓' : '✗'}`,
    `Bot: ${checks.bot ? '✓' : '✗'}`,
    `Session: ${checks.session ? '✓' : '✗'}`,
  ];
  if (critical.length) {
    lines.push('', `Критично: ${critical.join(', ')}`);
  } else if (issues.length) {
    lines.push('', `Предупреждение: ${issues.join(', ')}`);
  }
  if (opts.url) lines.push('', `URL: ${opts.url}`);
  return lines.join('\n');
}

module.exports = {
  buildHealthStatus,
  listHealthIssues,
  formatHealthAlertMessage,
};
