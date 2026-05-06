const crypto = require('crypto');
const { isKvConfigured, setUserPlan, planDurationDays } = require('./kvUserStore');
const { resolveTributePlanByProductId } = require('./tributeConfig');

function normalizeSignature(sig) {
  return String(sig || '').trim().toLowerCase();
}

function verifyTributeSignature(rawBody, signature, apiKey) {
  if (!apiKey) return false;
  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody || '');
  const expected = crypto.createHmac('sha256', apiKey).update(body).digest('hex');
  const provided = normalizeSignature(signature);
  if (!provided) return false;
  if (provided.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(provided, 'utf8'), Buffer.from(expected, 'utf8'));
}

function extractUserId(payload) {
  return String(
    payload?.telegram_user_id ||
      payload?.telegramUserId ||
      payload?.user_id ||
      payload?.userId ||
      payload?.user?.telegram_user_id ||
      payload?.user?.id ||
      '',
  ).trim();
}

async function handleTributeWebhook(req, res) {
  if (req.method === 'GET' || req.method === 'HEAD') {
    return res.status(200).json({ ok: true });
  }
  if (req.method !== 'POST') return res.status(405).end();

  const apiKey = String(process.env.TRIBUTE_API_KEY || '').trim();
  const signature = req.headers['trbt-signature'];
  if (!verifyTributeSignature(req.rawBody, signature, apiKey)) {
    return res.status(401).json({ error: 'invalid_webhook_signature' });
  }

  if (!isKvConfigured()) {
    return res.status(503).json({ error: 'redis_required', message: 'Подключите Redis перед обработкой Tribute webhook.' });
  }

  const body = req.body || {};
  const name = String(body.name || '').trim();
  const payload = body.payload || {};
  const userId = extractUserId(payload);
  const plan = resolveTributePlanByProductId(payload.product_id);

  if (!userId) {
    console.warn('Tribute webhook ignored: missing_user_id', {
      name,
      productId: payload.product_id,
      keys: Object.keys(payload || {}),
    });
    return res.status(200).json({ status: 'ok' });
  }

  if (name === 'digital_product_refunded') {
    if (plan) {
      await setUserPlan(userId, 'free');
    }
    return res.json({ status: 'ok' });
  }

  if (!plan && name !== 'new_subscription' && name !== 'renewed_subscription' && name !== 'new_digital_product') {
    return res.json({ status: 'ok' });
  }

  await setUserPlan(userId, plan || 'pro', { durationDays: planDurationDays() });
  return res.json({ status: 'ok' });
}

module.exports = {
  handleTributeWebhook,
  verifyTributeSignature,
};
