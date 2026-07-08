const fs = require('fs');
const path = require('path');
const { Bot } = require('grammy');
const { parseOwnerTelegramIds } = require('./appOwner');
const { buildHealthStatus, formatHealthAlertMessage } = require('./healthStatus');

const DEFAULT_STATE_PATH = path.join(process.cwd(), '.health-alert-state.json');
const REPEAT_ALERT_MS = 60 * 60 * 1000;

function loadState(statePath = DEFAULT_STATE_PATH) {
  try {
    const raw = fs.readFileSync(statePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return { lastOk: true, lastAlertAt: 0, lastIssues: '' };
  }
}

function saveState(state, statePath = DEFAULT_STATE_PATH) {
  try {
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
  } catch (e) {
    console.error('healthAlert: cannot save state:', e.message);
  }
}

async function sendOwnerTelegramMessage(text) {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const owners = parseOwnerTelegramIds();
  if (!token || !owners.length) {
    return { sent: false, reason: 'no_token_or_owners' };
  }
  const bot = new Bot(token);
  for (const ownerId of owners) {
    await bot.api.sendMessage(Number(ownerId), text, { parse_mode: 'HTML' });
  }
  return { sent: true, owners };
}

/**
 * Отправляет алерт владельцам при смене состояния или раз в час при длительной аварии.
 * @returns {Promise<{ checks: object, notified: boolean, recovered: boolean }>}
 */
async function evaluateAndAlert(opts = {}) {
  const checks = opts.checks || buildHealthStatus();
  const statePath = opts.statePath || DEFAULT_STATE_PATH;
  const send = opts.send || sendOwnerTelegramMessage;
  const state = loadState(statePath);
  const now = Date.now();
  const issuesKey = JSON.stringify({
    ok: checks.ok,
    redis: checks.redis,
    gemini: checks.gemini,
    bot: checks.bot,
    session: checks.session,
  });

  let notified = false;
  let recovered = false;

  if (checks.ok && !state.lastOk) {
    await send(
      formatHealthAlertMessage(checks, { recovered: true, url: opts.url }),
    );
    notified = true;
    recovered = true;
    saveState({ lastOk: true, lastAlertAt: now, lastIssues: issuesKey }, statePath);
    return { checks, notified, recovered };
  }

  if (!checks.ok) {
    const shouldAlert =
      state.lastOk
      || state.lastIssues !== issuesKey
      || now - (Number(state.lastAlertAt) || 0) >= REPEAT_ALERT_MS;

    if (shouldAlert) {
      await send(formatHealthAlertMessage(checks, { url: opts.url }));
      notified = true;
      saveState({ lastOk: false, lastAlertAt: now, lastIssues: issuesKey }, statePath);
      return { checks, notified, recovered: false };
    }
  }

  if (checks.ok && state.lastOk) {
    saveState({ ...state, lastIssues: issuesKey }, statePath);
  }

  return { checks, notified, recovered: false };
}

module.exports = {
  loadState,
  saveState,
  sendOwnerTelegramMessage,
  evaluateAndAlert,
  REPEAT_ALERT_MS,
};
