const { InputFile } = require('grammy');
const { resolveTelegramUser } = require('../lib/miniAppAuth');
const { isKvConfigured, getQuotaState } = require('../lib/kvUserStore');
const { canPublishImageToChannel } = require('../lib/planFeatures');
const { normalizeTelegramChannel } = require('../lib/telegramChannel');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const auth = resolveTelegramUser(req, res);
    if (!auth) return;

    if (!isKvConfigured()) {
      return res.status(503).json({
        error: 'kv_required',
        message: 'Подключите Upstash Redis для проверки тарифа.',
      });
    }

    if (!process.env.TELEGRAM_BOT_TOKEN) {
      return res.status(500).json({ error: 'TELEGRAM_BOT_TOKEN is not configured.' });
    }

    const { Bot } = require('grammy');
    const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);
    const { content, channelUsername, imageBase64, mimeType } = req.body;

    const targetChannel = normalizeTelegramChannel(channelUsername);
    if (!targetChannel) {
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
      await bot.api.sendPhoto(targetChannel, new InputFile(buf, `photo.${ext}`), { caption });
    } else if (content && String(content).trim()) {
      await bot.api.sendMessage(targetChannel, String(content));
    } else {
      return res.status(400).json({ error: 'empty_content', message: 'Нет текста или изображения.' });
    }

    res.json({ ok: true });
  } catch (e) {
    const status = Number(e?.error_code) || 500;
    const message = e?.description || e?.response?.description || e?.message || 'Не удалось опубликовать.';
    console.error('Publish error:', {
      status,
      message,
      errorCode: e?.error_code || null,
    });
    res.status(status).json({
      error: 'publish_failed',
      message,
    });
  }
};
