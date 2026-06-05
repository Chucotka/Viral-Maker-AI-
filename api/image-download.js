const { InputFile, Bot } = require('grammy');
const { resolveTelegramUser } = require('../lib/miniAppAuth');
const { sendSafeError } = require('../lib/httpErrors');
const {
  putImageDownload,
  getImageDownload,
  buildDownloadFileName,
  publicBaseUrl,
} = require('../lib/tempImageDownload');

function telegramUserErrorMessage(err) {
  const msg = String(err?.description || err?.message || err || '');
  if (/bot was blocked|user is deactivated/i.test(msg)) {
    return {
      status: 403,
      error: 'bot_blocked',
      message: 'Напишите боту /start в личных сообщениях, затем снова нажмите «Сохранить в галерею».',
    };
  }
  if (/can't initiate conversation|have no rights|chat not found/i.test(msg)) {
    return {
      status: 403,
      error: 'bot_not_started',
      message: 'Откройте чат с ботом, нажмите Start (/start), затем повторите сохранение.',
    };
  }
  return null;
}

async function handleSendImageToBot(req, res, auth) {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    return res.status(503).json({
      error: 'bot_required',
      message: 'Бот не настроен. Сохраните через долгое нажатие на превью картинки.',
    });
  }

  let token = String(req.body?.downloadToken || req.body?.token || '').trim();
  let row = token ? await getImageDownload(token) : null;

  if (!row) {
    const imageBase64 = String(req.body?.imageBase64 || '').trim();
    const mimeType = String(req.body?.mimeType || 'image/png').trim();
    if (!imageBase64) {
      return res.status(400).json({ error: 'image_required', message: 'Нет изображения для отправки.' });
    }
    token = await putImageDownload(auth.userId, imageBase64, mimeType);
    row = await getImageDownload(token);
  }

  if (!row || row.userId !== String(auth.userId)) {
    return res.status(403).json({ error: 'forbidden', message: 'Файл недоступен. Сгенерируйте картинку заново.' });
  }

  const buf = Buffer.from(row.imageBase64, 'base64');
  const fileName = buildDownloadFileName(row.mimeType);
  const ext = fileName.includes('.') ? fileName.split('.').pop() : 'png';
  const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);
  const caption =
    '🖼 Viral Maker AI\n\n' +
    'Чтобы сохранить в галерею: нажмите и удерживайте это фото → «Сохранить в галерею» / «Save to Photos».';

  const chatId = Number(auth.userId);
  await bot.api.sendPhoto(
    Number.isFinite(chatId) ? chatId : auth.userId,
    new InputFile(buf, `viral-maker-ai.${ext}`),
    { caption },
  );

  const botUsername = String(process.env.TELEGRAM_BOT_USERNAME || '').replace(/^@/, '');
  const chatLink = botUsername ? `https://t.me/${botUsername}` : null;

  return res.json({ ok: true, chatLink, botUsername: botUsername || null });
}

function setDownloadCors(req, res) {
  const origin = String(req.get('Origin') || '').trim();
  const allowed =
    !origin ||
    origin === 'https://web.telegram.org' ||
    origin === 'https://telegram.org' ||
    /\.telegram\.org$/i.test(origin);
  res.setHeader('Access-Control-Allow-Origin', allowed && origin ? origin : '*');
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

    const pathOnly = String(req.url || '').split('?')[0];
    const action = String(req.body?.action || req.query?.action || '').trim().toLowerCase();
    const isSendRoute = action === 'send' || pathOnly.endsWith('/send-image-save');
    if (isSendRoute) {
      try {
        return await handleSendImageToBot(req, res, auth);
      } catch (e) {
        const mapped = telegramUserErrorMessage(e);
        if (mapped) {
          return res.status(mapped.status).json({ error: mapped.error, message: mapped.message });
        }
        return sendSafeError(res, e, 'image-download-send');
      }
    }

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
