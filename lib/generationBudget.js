/** Запас до лимита serverless (60 с) — на VPS используется больший LOCAL_DEADLINE_MS. */
const SERVERLESS_DEADLINE_MS = Number(process.env.GENERATION_BUDGET_MS) || 52_000;
const LOCAL_DEADLINE_MS = 120_000;

function isServerlessRuntime() {
  return !!(process.env.VERCEL || process.env.VERCEL_ENV || process.env.AWS_LAMBDA_FUNCTION_NAME);
}

function createGenerationBudget(deadlineMs = isServerlessRuntime() ? SERVERLESS_DEADLINE_MS : LOCAL_DEADLINE_MS) {
  const startedAt = Date.now();
  return {
    startedAt,
    deadlineMs,
    elapsed() {
      return Date.now() - startedAt;
    },
    remaining() {
      return Math.max(0, deadlineMs - this.elapsed());
    },
    canSpend(minMs) {
      return this.remaining() >= minMs;
    },
  };
}

/** На serverless Premium — 2 кандидата вместо 3, чтобы уложиться в 60 с. */
function paidMaxCandidates(plan, requested) {
  const n = Math.max(1, Math.min(3, Number(requested) || 3));
  if (isServerlessRuntime() && plan === 'premium' && n > 2) return 2;
  return n;
}

module.exports = {
  createGenerationBudget,
  isServerlessRuntime,
  paidMaxCandidates,
  SERVERLESS_DEADLINE_MS,
};
