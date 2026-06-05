const { InputFile } = require('grammy');
const { resolveTelegramUser } = require('../lib/miniAppAuth');
const {
  getImageDownload,
  putImageDownload,
  buildDownloadFileName,
} = require('../lib/tempImageDownload');
const { sendSafeError } = require('../lib/httpErrors');

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

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const auth = resolveTelegramUser(req, res);
    if (!auth) return;

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

    const { Bot } = require('grammy');
    const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);

    const caption =
      '🖼 Viral Maker AI\n\n' +
      'Чтобы сохранить в галерею: нажмите и удерживайте это фото → «Сохранить в галерею» / «Save to Photos».';

    await bot.api.sendPhoto(auth.userId, new InputFile(buf, `viral-maker-ai.${ext}`), { caption });

    const botUsername = String(process.env.TELEGRAM_BOT_USERNAME || '').replace(/^@/, '');
    const chatLink = botUsername ? `https://t.me/${botUsername}` : null;

    return res.json({ ok: true, chatLink, botUsername: botUsername || null });
  } catch (e) {
    const mapped = telegramUserErrorMessage(e);
    if (mapped) {
      return res.status(mapped.status).json({ error: mapped.error, message: mapped.message });
    }
    return sendSafeError(res, e, 'send-image-save');
  }
};
