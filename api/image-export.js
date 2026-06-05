const { resolveTelegramUser } = require('../lib/miniAppAuth');
const { isKvConfigured } = require('../lib/kvUserStore');
const { createImageExport, consumeImageExport } = require('../lib/imageExportStore');
const { sendSafeError } = require('../lib/httpErrors');

function appBaseUrl(req) {
  const fromEnv = String(process.env.WEBAPP_URL || '').replace(/\/+$/, '');
  if (fromEnv) return fromEnv;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
  return `${proto}://${host}`;
}

function safeFileName(name, mimeType) {
  const raw = String(name || '').trim();
  if (/^[\w.\- ]+\.(png|jpe?g|webp)$/i.test(raw)) return raw.slice(0, 120);
  const ext = String(mimeType || '').includes('jpeg') ? 'jpg' : 'png';
  return `viral-maker-ai.${ext}`;
}

function setDownloadCors(res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://web.telegram.org');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    setDownloadCors(res);
    return res.status(204).end();
  }

  if (req.method === 'GET') {
    setDownloadCors(res);
    try {
      const token = req.query?.token;
      const payload = await consumeImageExport(token);
      if (!payload) {
        return res.status(404).json({ error: 'export_not_found', message: 'Ссылка устарела. Сгенерируйте картинку снова.' });
      }
      const fileName = safeFileName(payload.fileName, payload.mimeType);
      res.setHeader('Content-Type', payload.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).send(payload.buffer);
    } catch (e) {
      return sendSafeError(res, e, 'image-export-get');
    }
  }

  if (req.method !== 'POST') return res.status(405).end();

  try {
    if (!isKvConfigured()) {
      return res.status(503).json({
        error: 'kv_required',
        message: 'Подключите Upstash Redis для сохранения изображений.',
      });
    }

    const auth = resolveTelegramUser(req, res);
    if (!auth) return;

    const mimeType = String(req.body?.mimeType || 'image/png').trim();
    const imageBase64 = String(req.body?.imageBase64 || '').trim();
    const fileName = safeFileName(req.body?.fileName, mimeType);

    if (!imageBase64) {
      return res.status(400).json({ error: 'image_required', message: 'Нет данных изображения.' });
    }

    const { token } = await createImageExport({
      userId: auth.userId,
      mimeType,
      dataBase64: imageBase64,
      fileName,
    });

    const url = `${appBaseUrl(req)}/api/image-export?token=${encodeURIComponent(token)}`;
    return res.json({ ok: true, url, fileName });
  } catch (e) {
    if (e.message === 'image_too_large') {
      return res.status(413).json({ error: 'image_too_large', message: 'Изображение слишком большое для сохранения.' });
    }
    return sendSafeError(res, e, 'image-export-post');
  }
};
