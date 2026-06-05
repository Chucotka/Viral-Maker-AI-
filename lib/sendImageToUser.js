const { Bot, InputFile } = require('grammy');
const { getImageDownload } = require('./tempImageDownload');

const SAVE_CAPTION =
  '🖼 Viral Maker AI\n\n' +
  'Удержите это изображение → «Сохранить в галерею» / «Save to Photos».\n' +
  'Если кнопки нет — нажмите на файл и выберите «Скачать».';

function extensionFromMime(mimeType) {
  const mt = String(mimeType || '').toLowerCase();
  if (mt.includes('jpeg') || mt.includes('jpg')) return 'jpg';
  if (mt.includes('webp')) return 'webp';
  return 'png';
}

function mapTelegramSendError(err) {
  const msg = String(err?.description || err?.message || err || '');
  if (/bot was blocked|user is deactivated/i.test(msg)) {
    return {
      status: 403,
      error: 'bot_blocked',
      message: 'Бот заблокирован. Разблокируйте его в Telegram и нажмите /start.',
    };
  }
  if (/can't initiate conversation|bot can't initiate|have no rights|chat not found|PEER_ID_INVALID/i.test(msg)) {
    return {
      status: 403,
      error: 'bot_not_started',
      message: 'Сначала откройте бота и нажмите Start — затем снова «Сохранить в галерею».',
    };
  }
  return null;
}

async function sendImageBufferToUser(userId, buffer, mimeType) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return { ok: false, status: 503, error: 'bot_required', message: 'Бот не настроен на сервере.' };
  }

  const chatId = Number(userId);
  const target = Number.isFinite(chatId) ? chatId : String(userId);
  const ext = extensionFromMime(mimeType);
  const file = new InputFile(buffer, `viral-maker-ai.${ext}`);
  const bot = new Bot(token);

  try {
    await bot.api.sendDocument(target, file, { caption: SAVE_CAPTION });
    return { ok: true, method: 'document' };
  } catch (docErr) {
    const mapped = mapTelegramSendError(docErr);
    if (mapped) return { ok: false, ...mapped };
    try {
      await bot.api.sendPhoto(target, file, { caption: SAVE_CAPTION });
      return { ok: true, method: 'photo' };
    } catch (photoErr) {
      const mappedPhoto = mapTelegramSendError(photoErr);
      if (mappedPhoto) return { ok: false, ...mappedPhoto };
      throw photoErr;
    }
  }
}

async function sendImageTokenToUser(userId, downloadToken) {
  const row = await getImageDownload(downloadToken);
  if (!row) {
    return { ok: false, status: 404, error: 'download_not_found', message: 'Файл устарел. Сгенерируйте картинку снова.' };
  }
  if (row.userId !== String(userId)) {
    return { ok: false, status: 403, error: 'forbidden', message: 'Файл недоступен.' };
  }
  const buffer = Buffer.from(row.imageBase64, 'base64');
  return sendImageBufferToUser(userId, buffer, row.mimeType);
}

module.exports = {
  sendImageBufferToUser,
  sendImageTokenToUser,
  mapTelegramSendError,
  SAVE_CAPTION,
};
