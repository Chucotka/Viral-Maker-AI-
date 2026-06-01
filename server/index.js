const express = require('express');
const path = require('path');
const fs = require('fs');
const https = require('https');
const { InputFile } = require('grammy');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { modelFallbackChain, generateContentRobust } = require('../lib/geminiRobust');
const { generateGeminiImage } = require('../lib/geminiImageRest');
const { resolveTelegramUser, readInitDataString } = require('../lib/miniAppAuth');
const { validateInitData } = require('../lib/telegramInitData');
const { getWebhookBot } = require('../lib/webhookBot');
const { appendLocalHistory, getLocalHistory, updateLocalHistoryEntry } = require('../lib/localHistoryStore');
const { getTributePlanConfig } = require('../lib/tributeConfig');
const { handleTributeWebhook } = require('../lib/tributeWebhook');
const { hasDebugAccess, normalizeDebugPlan, debugDurationDays } = require('../lib/debugPlan');
const {
  isKvConfigured,
  getQuotaState,
  saveUserRecord,
  incrementGenerationCount,
} = require('../lib/kvUserStore');
const { appendUserHistory, getUserHistory, updateUserHistoryEntry } = require('../lib/kvHistory');
const {
  buildStudioTextPrompt,
  buildImageGenerationPrompt,
  buildImageCriticPrompt,
  buildSurpriseImagePrompt,
  inferPostGoal,
  isSurpriseRequest,
} = require('../lib/buildTextPrompt');
const { generateStudioTextContent } = require('../lib/textGeneration');
const { assertGenerateRateLimit } = require('../lib/rateLimitKv');
const { getTrendsList } = require('../lib/trendsProvider');
const { canPublishImageToChannel } = require('../lib/planFeatures');
const { normalizeTelegramChannel } = require('../lib/telegramChannel');

const app = express();
const USERS_PATH = '/tmp/users.json';

app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = Buffer.from(buf);
    },
  }),
);
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

function setFileUserPlan(userId, plan) {
  const today = new Date().toISOString().split('T')[0];
  const users = loadFileUsers();
  const days = debugDurationDays();
  if (!users[userId]) {
    users[userId] = { plan: 'free', dailyCount: 0, lastReset: today, planUntil: null };
  }
  users[userId].plan = plan === 'pro' || plan === 'premium' ? plan : 'free';
  users[userId].planUntil = users[userId].plan === 'free' ? null : new Date(Date.now() + days * 864e5).toISOString();
  users[userId].dailyCount = 0;
  users[userId].lastReset = today;
  saveFileUsers(users);
  return users[userId];
}

function appendFileHistory(userId, entry) {
  return appendLocalHistory(userId, entry);
}

function getFileHistory(userId, limit = 40) {
  return getLocalHistory(userId, limit);
}

function updateFileHistory(userId, ts, mutation) {
  return updateLocalHistoryEntry(userId, ts, mutation);
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
app.get('/api/tribute-link', (req, res) => {
  const plan = String(req.query?.plan || '').toLowerCase();
  const config = getTributePlanConfig(plan);
  if (!config) return res.status(400).json({ error: 'invalid_plan' });
  if (!config.webLink) {
    return res.status(503).json({
      error: 'tribute_not_configured',
      message: 'Добавьте TRIBUTE_PRO_WEBLINK / TRIBUTE_PREMIUM_WEBLINK в Vercel.',
    });
  }
  res.json({ plan: config.plan, link: config.webLink });
});
app.post('/api/tribute-webhook', handleTributeWebhook);
app.post('/api/debug-plan', async (req, res) => {
  try {
    if (!hasDebugAccess(req)) {
      return res.status(403).json({ error: 'forbidden' });
    }

    const plan = normalizeDebugPlan(req.body?.plan || req.query?.plan);
    if (!plan) {
      return res.status(400).json({ error: 'invalid_plan' });
    }

    const auth = isKvConfigured() ? resolveTelegramUser(req, res) : resolveStudioUser(req, res);
    if (!auth) return;

    if (isKvConfigured()) {
      const { rec } = await getQuotaState(auth.userId);
      await saveUserRecord(auth.userId, {
        ...rec,
        plan,
        planUntil: new Date(Date.now() + debugDurationDays() * 864e5).toISOString(),
        dailyCount: 0,
      });
    } else {
      setFileUserPlan(auth.userId, plan);
    }

    console.info('Debug plan activated', { userId: auth.userId, plan });
    return res.json({ ok: true, userId: auth.userId, plan });
  } catch (e) {
    console.error('Debug plan error:', e.message);
    return res.status(500).json({ error: e.message });
  }
});
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

    const { topic, platform = 'Telegram', tone = 'вирусный', model = 'gemini-2.5-flash', intent = 'auto', risk = 'balanced' } = req.body;

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
    let recentHistory = [];
    try {
      recentHistory =
        ctx.mode === 'kv' ? await getUserHistory(auth.userId, 20) : await getLocalHistory(auth.userId, 20);
    } catch (histErr) {
      console.error('recentHistory:', histErr.message);
    }

    const profileRec = ctx.mode === 'kv' ? ctx.rec : ctx.users[ctx.userId] || {};
    const goal = inferPostGoal({
      topic,
      intent,
      profile: profileRec,
      recentHistory,
      risk,
    });
    const prompt = buildStudioTextPrompt({
      topic,
      platform,
      tone,
      profile: profileRec,
      recentHistory,
      risk,
      goal,
    });

    const {
      content,
      modelUsed,
      viralScore,
      draftScore,
      rewriteApplied,
      selectedAngle,
      candidateCount,
      candidateSummary,
      criticScore,
      criticNeedsRewrite,
      criticVerdict,
      criticIssues,
      criticStrengths,
      criticBreakdown,
      alternateContent,
      alternateAngle,
      alternateScore,
      goal: detectedGoal,
      pipelineMode,
      generationMs,
    } = await generateStudioTextContent(
      genAI,
      modelChain,
      prompt,
      {
        topic,
        platform,
        tone,
        intent,
        risk,
        profile: profileRec,
        recentHistory,
        goal,
        plan,
        paidTierActive: ctx.limit === Infinity,
      },
    );
    const { remainingToday } = await bumpQuota(auth.userId, ctx);

    const historyTs = Date.now();
    if (ctx.mode === 'kv') {
      try {
        await appendUserHistory(auth.userId, {
          ts: historyTs,
          type: 'text',
          topic: topic.trim().slice(0, 240),
          text: content.slice(0, 4000),
          score: viralScore,
          platform,
          risk,
          goal: detectedGoal || goal,
          selectedAngle,
          rewriteApplied: !!rewriteApplied,
          candidateCount: Number(candidateCount) || 0,
          criticScore: Number(criticScore) || 0,
          criticNeedsRewrite: !!criticNeedsRewrite,
          criticVerdict: criticVerdict || '',
          criticIssues: Array.isArray(criticIssues) ? criticIssues.slice(0, 4) : [],
          criticStrengths: Array.isArray(criticStrengths) ? criticStrengths.slice(0, 4) : [],
          criticBreakdown: criticBreakdown || {},
          alternateText: alternateContent || '',
          alternateAngle: alternateAngle || '',
          alternateScore: Number(alternateScore) || 0,
          pipelineMode: pipelineMode || '',
          generationMs: Number(generationMs) || 0,
        });
      } catch (histErr) {
        console.error('appendUserHistory:', histErr.message);
      }
    } else {
      try {
        await appendFileHistory(auth.userId, {
          ts: historyTs,
          type: 'text',
          topic: topic.trim().slice(0, 240),
          text: content.slice(0, 4000),
          score: viralScore,
          platform,
          risk,
          goal: detectedGoal || goal,
          selectedAngle,
          rewriteApplied: !!rewriteApplied,
          candidateCount: Number(candidateCount) || 0,
          criticScore: Number(criticScore) || 0,
          criticNeedsRewrite: !!criticNeedsRewrite,
          criticVerdict: criticVerdict || '',
          criticIssues: Array.isArray(criticIssues) ? criticIssues.slice(0, 4) : [],
          criticStrengths: Array.isArray(criticStrengths) ? criticStrengths.slice(0, 4) : [],
          criticBreakdown: criticBreakdown || {},
          alternateText: alternateContent || '',
          alternateAngle: alternateAngle || '',
          alternateScore: Number(alternateScore) || 0,
          pipelineMode: pipelineMode || '',
          generationMs: Number(generationMs) || 0,
        });
      } catch (histErr) {
        console.error('appendFileHistory:', histErr.message);
      }
    }

    res.json({
      content,
      viralScore,
      draftScore,
      model: modelUsed,
      risk,
      goal: detectedGoal || goal,
      rewriteApplied,
      selectedAngle,
      candidateCount,
      candidateSummary,
      criticScore,
      criticNeedsRewrite,
      criticVerdict,
      criticIssues,
      criticStrengths,
      criticBreakdown,
      alternateContent,
      alternateAngle,
      alternateScore,
      pipelineMode,
      generationMs,
      historyTs,
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

    const { prompt: rawPrompt, aspectRatio = '1:1', style = '', risk = 'balanced' } = req.body;
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
    let recentHistory = [];
    try {
      recentHistory =
        ctx.mode === 'kv' ? await getUserHistory(auth.userId, 20) : await getLocalHistory(auth.userId, 20);
    } catch (histErr) {
      console.error('recentHistory:', histErr.message);
    }
    const fullPrompt = isSurpriseRequest(prompt)
      ? buildSurpriseImagePrompt({ aspectRatio, style: styleBit, profile: profileRec, recentHistory, risk })
      : buildImageGenerationPrompt({
          prompt,
          aspectRatio,
          style: styleBit,
          profile: profileRec,
          recentHistory,
          risk,
        });
    let finalPrompt = fullPrompt;
    let directorApplied = false;
    try {
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const criticPrompt = buildImageCriticPrompt({
        basePrompt: fullPrompt,
        aspectRatio,
        style: styleBit,
        profile: profileRec,
        recentHistory,
        risk,
      });
      const critique = await generateContentRobust(genAI, modelFallbackChain('gemini-2.5-flash'), criticPrompt, {});
      const revised = String(critique.content || '').trim();
      if (revised) {
        finalPrompt = revised;
        directorApplied = true;
      }
    } catch (criticErr) {
      console.error('image director:', criticErr.message);
    }

    const { mimeType, dataBase64, modelUsed } = await generateGeminiImage({
      apiKey: process.env.GEMINI_API_KEY,
      prompt: finalPrompt,
      aspectRatio,
    });

    const { remainingToday } = await bumpQuota(auth.userId, ctx);

    const historyTs = Date.now();
    if (ctx.mode === 'kv') {
      try {
        await appendUserHistory(auth.userId, {
          ts: historyTs,
          type: 'image',
          prompt: prompt.slice(0, 400),
          directorApplied: !!directorApplied,
        });
      } catch (histErr) {
        console.error('appendUserHistory:', histErr.message);
      }
    } else {
      try {
        await appendFileHistory(auth.userId, {
          ts: historyTs,
          type: 'image',
          prompt: prompt.slice(0, 400),
          directorApplied: !!directorApplied,
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
      directorApplied,
      historyTs,
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

app.post('/api/history', async (req, res) => {
  try {
    const auth = resolveStudioUser(req, res);
    if (!auth) return;
    const ts = Number(req.body?.ts);
    const mutation = req.body?.mutation && typeof req.body.mutation === 'object' ? req.body.mutation : {};
    if (!Number.isFinite(ts)) {
      return res.status(400).json({ error: 'invalid_ts' });
    }
    const item = isKvConfigured()
      ? await updateUserHistoryEntry(auth.userId, ts, mutation)
      : await updateFileHistory(auth.userId, ts, mutation);
    if (!item) return res.status(404).json({ error: 'history_item_not_found' });
    res.json({ ok: true, item });
  } catch (e) {
    console.error('History feedback API error:', e.message);
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
  const brandMemory = typeof body?.brandMemory === 'string' ? body.brandMemory.trim().slice(0, 1000) : '';
  return { niche, language, styleNote, brandMemory };
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
          brandMemory: rec.brandMemory || '',
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
        brandMemory: typeof u.brandMemory === 'string' ? u.brandMemory : '',
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

    const { niche, language, styleNote, brandMemory } = sanitizeProfileBody(req.body || {});

    if (isKvConfigured()) {
      const { rec } = await getQuotaState(auth.userId);
      await saveUserRecord(auth.userId, { ...rec, niche, language, styleNote, brandMemory });
      return res.json({ ok: true, profile: { niche, language, styleNote, brandMemory } });
    }

    const users = loadFileUsers();
    const today = new Date().toISOString().split('T')[0];
    if (!users[auth.userId]) users[auth.userId] = { plan: 'free', dailyCount: 0, lastReset: today };
    Object.assign(users[auth.userId], { niche, language, styleNote, brandMemory });
    saveFileUsers(users);
    res.json({ ok: true, profile: { niche, language, styleNote, brandMemory } });
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

    const targetChannel = normalizeTelegramChannel(channelUsername);
    if (!targetChannel) {
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
});

module.exports = app;
