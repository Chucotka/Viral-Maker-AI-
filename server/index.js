const express = require('express');
const path = require('path');
const fs = require('fs');
const https = require('https');
const { InputFile } = require('grammy');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { generateContentRobust, modelFallbackChain } = require('../lib/geminiRobust');
const { generateGeminiImage } = require('../lib/geminiImageRest');
const { computeViralScore } = require('../lib/viralScore');
const { resolveTelegramUser, readInitDataString } = require('../lib/miniAppAuth');
const { validateInitData } = require('../lib/telegramInitData');
const { getWebhookBot } = require('../lib/webhookBot');
const { appendLocalHistory, getLocalHistory } = require('../lib/localHistoryStore');
const {
  isKvConfigured,
  getQuotaState,
  saveUserRecord,
  incrementGenerationCount,
} = require('../lib/kvUserStore');
const { appendUserHistory, getUserHistory } = require('../lib/kvHistory');
const { buildStudioTextPrompt, profileImageHint } = require('../lib/buildTextPrompt');
const { assertGenerateRateLimit } = require('../lib/rateLimitKv');
const { getTrendsList } = require('../lib/trendsProvider');
const { canPublishImageToChannel } = require('../lib/planFeatures');

const app = express();
const USERS_PATH = '/tmp/users.json';

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

function paidPlan(plan) {
  return plan === 'pro' || plan === 'premium';
}

/** Локальный файл: pro/premium без planUntil — без срока (dev); с planUntil — как в KV. */
function filePaidActive(u) {
  if (!paidPlan(u.plan)) return false;
  if (!u.planUntil) return true;
  return new Date(u.planUntil) > new Date();
}

function loadFileUsers() {
  try {
    return JSON.parse(fs.readFileSync(USERS_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function saveFileUsers(users) {
  fs.writeFileSync(USERS_PATH, JSON.stringify(users));
}

function appendFileHistory(userId, entry) {
  return appendLocalHistory(userId, entry);
}

function getFileHistory(userId, limit = 40) {
  return getLocalHistory(userId, limit);
}

/** Как в Vercel API: с KV — только initData; без KV — initData или userId из query/body. */
function resolveStudioUser(req, res) {
  if (isKvConfigured()) {
    return resolveTelegramUser(req, res);
  }
  const initData = readInitDataString(req);
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (initData && token) {
    const parsed = validateInitData(initData, token);
    if (parsed) return { userId: String(parsed.user.id), user: parsed.user };
  }
  const uid = req.body?.userId ?? req.query?.userId ?? req.query?.id ?? 'anonymous';
  return { userId: String(uid), user: null };
}

async function quotaContextOrError(res, userId) {
  if (isKvConfigured()) {
    const { rec, limit } = await getQuotaState(userId);
    if (rec.dailyCount >= limit) {
      res.status(403).json({ error: 'limit_reached', message: 'Лимит исчерпан. Перейди на Pro.' });
      return null;
    }
    return { mode: 'kv', rec, limit };
  }

  const today = new Date().toISOString().split('T')[0];
  const users = loadFileUsers();
  if (!users[userId]) users[userId] = { plan: 'free', dailyCount: 0, lastReset: today };
  if (users[userId].lastReset !== today) {
    users[userId].dailyCount = 0;
    users[userId].lastReset = today;
  }
  const limit = filePaidActive(users[userId]) ? Infinity : 5;
  if (users[userId].dailyCount >= limit) {
    res.status(403).json({ error: 'limit_reached', message: 'Лимит исчерпан. Перейди на Pro.' });
    return null;
  }
  return { mode: 'file', users, userId, limit };
}

async function bumpQuota(userId, ctx) {
  if (ctx.mode === 'kv') {
    return incrementGenerationCount(userId, ctx.rec);
  }
  ctx.users[userId].dailyCount += 1;
  saveFileUsers(ctx.users);
  const limit = ctx.limit;
  const remainingToday = limit === Infinity ? undefined : Math.max(0, limit - ctx.users[userId].dailyCount);
  return { record: ctx.users[userId], remainingToday };
}

// Health checks
app.get('/api/ping', (req, res) => res.send('pong'));
app.get('/api/test', (req, res) =>
  res.json({ ok: true, token: !!process.env.TELEGRAM_BOT_TOKEN, gemini: !!process.env.GEMINI_API_KEY }),
);

app.get('/api/webhook', (req, res) => res.json({ ok: true, message: 'webhook endpoint is alive' }));
app.post('/api/webhook', async (req, res) => {
  const updateId = req.body?.update_id;
  try {
    if (!process.env.TELEGRAM_BOT_TOKEN) {
      console.error('Missing TELEGRAM_BOT_TOKEN');
      return res.status(200).end();
    }
    const webAppUrl = process.env.WEBAPP_URL || 'https://viral-maker-ai.vercel.app';
    const bot = await getWebhookBot({
      token: process.env.TELEGRAM_BOT_TOKEN,
      webAppUrl,
    });
    await bot.handleUpdate(req.body);
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error('Webhook error:', e.message, updateId ? `update_id=${updateId}` : '');
    res.status(200).json({ ok: false });
  }
});

app.post('/api/generate', async (req, res) => {
  try {
    const auth = resolveStudioUser(req, res);
    if (!auth) return;

    const { topic, platform = 'Telegram', tone = 'вирусный', model = 'gemini-2.5-flash' } = req.body;

    if (!topic || topic.trim().length === 0) {
      return res.status(400).json({ error: 'topic_required', message: 'Тема не указана.' });
    }
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: 'missing_api_key' });
    }

    const ctx = await quotaContextOrError(res, auth.userId);
    if (!ctx) return;

    const plan = ctx.mode === 'kv' ? ctx.rec.plan : ctx.users[ctx.userId]?.plan || 'free';
    if (!(await assertGenerateRateLimit(auth.userId, res, plan))) return;

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const modelChain = modelFallbackChain(model);

    const profileRec = ctx.mode === 'kv' ? ctx.rec : ctx.users[ctx.userId] || {};
    const prompt = buildStudioTextPrompt({
      topic,
      platform,
      tone,
      profile: profileRec,
    });

    const { content, modelUsed } = await generateContentRobust(genAI, modelChain, prompt);
    const { remainingToday } = await bumpQuota(auth.userId, ctx);
    const viralScore = computeViralScore(content);

    if (ctx.mode === 'kv') {
      try {
        await appendUserHistory(auth.userId, {
          type: 'text',
          topic: topic.trim().slice(0, 240),
          text: content.slice(0, 4000),
          score: viralScore,
          platform,
        });
      } catch (histErr) {
        console.error('appendUserHistory:', histErr.message);
      }
    } else {
      try {
        await appendFileHistory(auth.userId, {
          type: 'text',
          topic: topic.trim().slice(0, 240),
          text: content.slice(0, 4000),
          score: viralScore,
          platform,
        });
      } catch (histErr) {
        console.error('appendFileHistory:', histErr.message);
      }
    }

    res.json({
      content,
      viralScore,
      model: modelUsed,
      ...(remainingToday !== undefined ? { remainingToday } : {}),
    });
  } catch (e) {
    console.error('GEMINI ERROR:', e.message, e.status, JSON.stringify(e));
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/generate-image', async (req, res) => {
  try {
    const auth = resolveStudioUser(req, res);
    if (!auth) return;

    const { prompt: rawPrompt, aspectRatio = '1:1', style = '' } = req.body;
    const prompt = String(rawPrompt || '').trim();
    if (!prompt) {
      return res.status(400).json({ error: 'prompt_required', message: 'Введите описание картинки.' });
    }
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: 'missing_api_key' });
    }

    const ctx = await quotaContextOrError(res, auth.userId);
    if (!ctx) return;

    const plan = ctx.mode === 'kv' ? ctx.rec.plan : ctx.users[ctx.userId]?.plan || 'free';
    if (!(await assertGenerateRateLimit(auth.userId, res, plan))) return;

    const styleBit = String(style || '').trim();
    const profileRec = ctx.mode === 'kv' ? ctx.rec : ctx.users[ctx.userId] || {};
    const profileHint = profileImageHint(profileRec);
    const fullPrompt = styleBit
      ? `${prompt}. Стиль и настроение: ${styleBit}. Высокое качество, чёткие детали.${profileHint}`
      : `${prompt}. Высокое качество, чёткие детали, яркая композиция.${profileHint}`;

    const { mimeType, dataBase64, modelUsed } = await generateGeminiImage({
      apiKey: process.env.GEMINI_API_KEY,
      prompt: fullPrompt,
      aspectRatio,
    });

    const { remainingToday } = await bumpQuota(auth.userId, ctx);

    if (ctx.mode === 'kv') {
      try {
        await appendUserHistory(auth.userId, {
          type: 'image',
          prompt: prompt.slice(0, 400),
        });
      } catch (histErr) {
        console.error('appendUserHistory:', histErr.message);
      }
    } else {
      try {
        await appendFileHistory(auth.userId, {
          type: 'image',
          prompt: prompt.slice(0, 400),
        });
      } catch (histErr) {
        console.error('appendFileHistory:', histErr.message);
      }
    }

    res.json({
      mimeType,
      imageBase64: dataBase64,
      dataUrl: `data:${mimeType};base64,${dataBase64}`,
      model: modelUsed,
      ...(remainingToday !== undefined ? { remainingToday } : {}),
    });
  } catch (e) {
    console.error('GEMINI IMAGE ERROR:', e.message, e.status);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/history', async (req, res) => {
  try {
    const auth = resolveStudioUser(req, res);
    if (!auth) return;
    const items = isKvConfigured() ? await getUserHistory(auth.userId, 40) : await getFileHistory(auth.userId, 40);
    res.json({ items });
  } catch (e) {
    console.error('History API error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/trends', async (req, res) => {
  try {
    const trends = await getTrendsList();
    res.json({ trends });
  } catch (e) {
    console.error('trends:', e.message);
    res.status(500).json({ error: e.message });
  }
});

function sanitizeProfileBody(body) {
  const niche = typeof body?.niche === 'string' ? body.niche.trim().slice(0, 120) : '';
  const language = typeof body?.language === 'string' ? body.language.trim().slice(0, 40) : '';
  const styleNote = typeof body?.styleNote === 'string' ? body.styleNote.trim().slice(0, 200) : '';
  return { niche, language, styleNote };
}

app.get('/api/user', async (req, res) => {
  try {
    const auth = resolveStudioUser(req, res);
    if (!auth) return;

    if (isKvConfigured()) {
      const { rec } = await getQuotaState(auth.userId);
      return res.json({
        plan: rec.plan,
        dailyCount: rec.dailyCount,
        userId: auth.userId,
        planUntil: rec.planUntil || null,
        profile: {
          niche: rec.niche || '',
          language: rec.language || '',
          styleNote: rec.styleNote || '',
        },
      });
    }

    const users = loadFileUsers();
    const u = users[auth.userId] || { plan: 'free', dailyCount: 0 };
    res.json({
      plan: u.plan,
      dailyCount: u.dailyCount,
      userId: auth.userId,
      planUntil: u.planUntil || null,
      profile: {
        niche: typeof u.niche === 'string' ? u.niche : '',
        language: typeof u.language === 'string' ? u.language : '',
        styleNote: typeof u.styleNote === 'string' ? u.styleNote : '',
      },
    });
  } catch (e) {
    console.error('User API error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/user', async (req, res) => {
  try {
    const auth = resolveStudioUser(req, res);
    if (!auth) return;

    const { niche, language, styleNote } = sanitizeProfileBody(req.body || {});

    if (isKvConfigured()) {
      const { rec } = await getQuotaState(auth.userId);
      await saveUserRecord(auth.userId, { ...rec, niche, language, styleNote });
      return res.json({ ok: true, profile: { niche, language, styleNote } });
    }

    const users = loadFileUsers();
    const today = new Date().toISOString().split('T')[0];
    if (!users[auth.userId]) users[auth.userId] = { plan: 'free', dailyCount: 0, lastReset: today };
    Object.assign(users[auth.userId], { niche, language, styleNote });
    saveFileUsers(users);
    res.json({ ok: true, profile: { niche, language, styleNote } });
  } catch (e) {
    console.error('User POST error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/create-invoice', async (req, res) => {
  try {
    const auth = resolveStudioUser(req, res);
    if (!auth) return;

    const { plan } = req.body;
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!plan) return res.status(400).json({ error: 'Missing plan' });
    if (!token) return res.status(500).json({ error: 'Missing bot token' });

    const userId = auth.userId;
    let title;
    let description;
    let price;
    if (plan === 'pro') {
      title = 'Viral Maker Pro';
      description = 'Безлимитные генерации + аналитика на 30 дней';
      price = 99;
    } else if (plan === 'premium') {
      title = 'Viral Maker Premium';
      description = 'Публикация картинок в канал + увеличенный лимит генераций на 30 дней';
      price = 299;
    } else {
      return res.status(400).json({ error: 'Invalid plan' });
    }

    const postData = JSON.stringify({
      title,
      description,
      payload: `plan_${plan}_${userId}`,
      provider_token: '',
      currency: 'XTR',
      subscription_period: 2592000,
      prices: [{ label: title, amount: price }],
    });

    const options = {
      hostname: 'api.telegram.org',
      path: `/bot${token}/createInvoiceLink`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const result = await new Promise((resolve, reject) => {
      const gReq = https.request(options, (gRes) => {
        let data = '';
        gRes.on('data', (chunk) => {
          data += chunk;
        });
        gRes.on('end', () => {
          try {
            resolve(JSON.parse(data || '{}'));
          } catch (err) {
            reject(err);
          }
        });
      });
      gReq.on('error', (e) => reject(e));
      gReq.write(postData);
      gReq.end();
    });

    if (result.ok) {
      res.json({ link: result.result });
    } else {
      console.error('Invoice error:', result);
      res.status(500).json({
        error: 'Failed to create invoice',
        message: result?.description || result?.error || 'Telegram rejected the invoice.',
      });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/publish', async (req, res) => {
  try {
    const auth = resolveStudioUser(req, res);
    if (!auth) return;

    if (!process.env.TELEGRAM_BOT_TOKEN) {
      return res.status(500).json({ error: 'TELEGRAM_BOT_TOKEN is not configured.' });
    }
    const { Bot } = require('grammy');
    const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);
    const { content, channelUsername, imageBase64, mimeType } = req.body;

    if (!channelUsername || typeof channelUsername !== 'string') {
      return res.status(400).json({ error: 'channel_required' });
    }

    let publishRec;
    if (isKvConfigured()) {
      const { rec } = await getQuotaState(auth.userId);
      publishRec = rec;
    } else {
      const users = loadFileUsers();
      publishRec = users[auth.userId] || {};
    }
    if (imageBase64 && mimeType) {
      if (
        !canPublishImageToChannel(publishRec, {
          allowFileDevLegacy: !isKvConfigured(),
        })
      ) {
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
    res
      .status(500)
      .json({ error: 'Не удалось опубликовать. Убедись что бот добавлен как администратор канала.' });
  }
});

module.exports = app;
