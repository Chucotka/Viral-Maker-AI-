const crypto = require('crypto');
const { isKvConfigured, setUserPlan, planDurationDays } = require('./kvUserStore');
const { resolveTributePlanByProductId } = require('./tributeConfig');

function normalizeSignature(sig) {
  return String(sig || '').trim().toLowerCase();
}

function readTributeSignature(headers) {
  const h = headers || {};
  return (
    h['trbt-signature'] ||
    h['x-trbt-signature'] ||
    h['x-tribute-signature'] ||
    h['x-signature'] ||
    h.signature ||
    ''
  );
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
      payload?.purchase?.telegram_user_id ||
      payload?.purchase?.user_id ||
      '',
  ).trim();
}

function extractProductId(payload) {
  const raw =
    payload?.product_id ??
    payload?.productId ??
    payload?.product?.id ??
    payload?.purchase?.product_id ??
    payload?.purchase?.productId;
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
}

async function handleTributeWebhook(req, res) {
  console.info('Tribute webhook request', {
    method: req.method,
    path: req.url,
    contentType: req.headers['content-type'] || '',
    userAgent: req.headers['user-agent'] || '',
  });

  if (req.method === 'GET' || req.method === 'HEAD') {
    return res.status(200).json({ ok: true });
  }
  if (req.method !== 'POST') return res.status(405).end();

  const apiKey = String(process.env.TRIBUTE_API_KEY || '').trim();
  const signature = readTributeSignature(req.headers);
  if (!verifyTributeSignature(req.rawBody, signature, apiKey)) {
    const presentSigHeaders = Object.keys(req.headers || {}).filter((k) =>
      /signature|trbt|tribute/i.test(String(k)),
    );
    console.warn('Tribute webhook: invalid signature', {
      hasApiKey: !!apiKey,
      signatureLength: String(signature || '').length,
      presentSigHeaders,
    });
    return res.status(401).json({ error: 'invalid_webhook_signature' });
  }

  if (!isKvConfigured()) {
    return res.status(503).json({ error: 'redis_required', message: 'Подключите Redis перед обработкой Tribute webhook.' });
  }

  const body = req.body || {};
  const name = String(body.name || '').trim();
  const payload = body.payload || {};
  const userId = extractUserId(payload);
  const productId = extractProductId(payload);
  const plan = resolveTributePlanByProductId(productId);

  console.info('Tribute webhook parsed', {
    name,
    userId: userId || null,
    productId,
    keys: Object.keys(payload || {}),
  });

  if (!userId) {
    console.warn('Tribute webhook ignored: missing_user_id', {
      name,
      productId,
      keys: Object.keys(payload || {}),
      raw: typeof req.rawBody === 'string' ? req.rawBody : req.rawBody?.toString?.('utf8')?.slice(0, 1200),
    });
    return res.status(200).json({ status: 'ok' });
  }

  if (!productId) {
    console.warn('Tribute webhook ignored: missing_product_id', {
      name,
      userId,
      keys: Object.keys(payload || {}),
      raw: typeof req.rawBody === 'string' ? req.rawBody : req.rawBody?.toString?.('utf8')?.slice(0, 1200),
    });
    return res.status(200).json({ status: 'ok' });
  }

  if (name === 'digital_product_refunded') {
    if (plan) {
      await setUserPlan(userId, 'free');
      console.info('Tribute webhook: plan revoked', { userId, plan, productId });
    }
    return res.json({ status: 'ok' });
  }

  if (!plan && name !== 'new_subscription' && name !== 'renewed_subscription' && name !== 'new_digital_product') {
    return res.json({ status: 'ok' });
  }

  await setUserPlan(userId, plan || 'pro', { durationDays: planDurationDays() });
  console.info('Tribute webhook: plan activated', {
    userId,
    plan: plan || 'pro',
    productId,
    event: name,
  });
  return res.json({ status: 'ok' });
}

module.exports = {
  handleTributeWebhook,
  verifyTributeSignature,
  readTributeSignature,
};
