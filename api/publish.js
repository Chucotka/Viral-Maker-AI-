const { InputFile } = require('grammy');
const { resolveTelegramUser } = require('../lib/miniAppAuth');
const { isKvConfigured, getQuotaState } = require('../lib/kvUserStore');
const { canPublishImageToChannel } = require('../lib/planFeatures');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const auth = resolveTelegramUser(req, res);
    if (!auth) return;

    if (!isKvConfigured()) {
      return res.status(503).json({
        error: 'kv_required',
        message: 'Подключите Vercel KV для проверки тарифа.',
      });
    }

    if (!process.env.TELEGRAM_BOT_TOKEN) {
      return res.status(500).json({ error: 'TELEGRAM_BOT_TOKEN is not configured.' });
    }

    const { Bot } = require('grammy');
    const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);
    const { content, channelUsername, imageBase64, mimeType } = req.body;

    if (!channelUsername || typeof channelUsername !== 'string') {
      return res.status(400).json({ error: 'channel_required' });
    }

    const { rec } = await getQuotaState(auth.userId);
    if (imageBase64 && mimeType) {
      if (!canPublishImageToChannel(rec)) {
        return res.status(403).json({
          error: 'premium_required',
          message: 'Публикация изображений в канал — тариф Premium (активная подписка).',
        });
      }
    }

    if (imageBase64 && mimeType) {
      const buf = Buffer.from(String(imageBase64), 'base64');
      const ext = String(mimeType).includes('jpeg') ? 'jpg' : 'png';
      const caption = content && String(content).trim() ? String(content).trim().slice(0, 1024) : undefined;
      await bot.api.sendPhoto(channelUsername, new InputFile(buf, `photo.${ext}`), { caption });
    } else if (content && String(content).trim()) {
      await bot.api.sendMessage(channelUsername, String(content));
    } else {
      return res.status(400).json({ error: 'empty_content', message: 'Нет текста или изображения.' });
    }

    res.json({ ok: true });
  } catch (e) {
    console.error('Publish error:', e.message);
    res.status(500).json({ error: 'Не удалось опубликовать. Убедись что бот добавлен как администратор канала.' });
  }
};
