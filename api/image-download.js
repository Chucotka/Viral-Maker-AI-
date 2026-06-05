const { resolveTelegramUser } = require('../lib/miniAppAuth');
const { sendSafeError } = require('../lib/httpErrors');
const {
  putImageDownload,
  getImageDownload,
  buildDownloadFileName,
  publicBaseUrl,
} = require('../lib/tempImageDownload');

function setDownloadCors(req, res) {
  const origin = String(req.get('Origin') || '').trim();
  const allowed =
    origin === 'https://web.telegram.org' ||
    origin === 'https://telegram.org' ||
    /\.telegram\.org$/i.test(origin);
  res.setHeader('Access-Control-Allow-Origin', allowed ? origin : 'https://web.telegram.org');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, Content-Type');
}

function sendImageAttachment(req, res, buffer, mimeType, fileName) {
  setDownloadCors(req, res);
  res.setHeader('Content-Type', mimeType || 'image/png');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.status(200).send(buffer);
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    setDownloadCors(req, res);
    return res.status(204).end();
  }

  if (req.method === 'GET') {
    try {
      const token = String(req.query?.t || req.query?.token || '').trim();
      const row = await getImageDownload(token);
      if (!row) {
        return res.status(404).json({ error: 'download_not_found', message: 'Ссылка устарела. Сгенерируйте картинку снова.' });
      }
      const buffer = Buffer.from(row.imageBase64, 'base64');
      const fileName = buildDownloadFileName(row.mimeType);
      return sendImageAttachment(req, res, buffer, row.mimeType, fileName);
    } catch (e) {
      return sendSafeError(res, e, 'image-download-get');
    }
  }

  if (req.method !== 'POST') return res.status(405).end();

  try {
    const auth = resolveTelegramUser(req, res);
    if (!auth) return;

    const imageBase64 = String(req.body?.imageBase64 || '').trim();
    const mimeType = String(req.body?.mimeType || 'image/png').trim();
    if (!imageBase64) {
      return res.status(400).json({ error: 'image_required', message: 'Нет данных изображения.' });
    }

    const token = await putImageDownload(auth.userId, imageBase64, mimeType);
    const base = publicBaseUrl(req);
    if (!base) {
      return res.status(503).json({
        error: 'base_url_required',
        message: 'Укажите WEBAPP_URL в настройках сервера для скачивания на телефон.',
      });
    }

    const fileName = buildDownloadFileName(mimeType);
    const downloadUrl = `${base}/api/image-download?t=${encodeURIComponent(token)}`;

    return res.json({ downloadUrl, fileName, token });
  } catch (e) {
    if (e.message === 'image_too_large') {
      return res.status(413).json({ error: 'image_too_large', message: 'Изображение слишком большое для скачивания.' });
    }
    return sendSafeError(res, e, 'image-download-post');
  }
};
