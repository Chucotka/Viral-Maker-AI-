/**
 * @param {{ niche?: string, language?: string, styleNote?: string, brandMemory?: string }} profile — из записи пользователя KV
 */
function profileSuffix(profile) {
  if (!profile || typeof profile !== 'object') return '';
  const parts = [];
  const niche = String(profile.niche || '').trim();
  const language = String(profile.language || '').trim();
  const styleNote = String(profile.styleNote || '').trim();
  const brandMemory = String(profile.brandMemory || '').trim();
  if (niche) parts.push(`Ниша автора: ${niche}.`);
  if (language) parts.push(`Язык ответа: ${language}.`);
  if (styleNote) parts.push(`Стиль и ограничения: ${styleNote}.`);
  if (brandMemory) parts.push(`Память бренда: ${brandMemory}.`);
  if (!parts.length) return '';
  return `\n\n${parts.join(' ')}\n`;
}

function summarizeRecentHistory(items, limit = 5) {
  const rows = [];
  for (const item of Array.isArray(items) ? items : []) {
    if (!item || typeof item !== 'object') continue;
    const kind = item.type === 'image' ? 'изображение' : 'пост';
    const rawText =
      item.type === 'image'
        ? String(item.prompt || item.text || item.topic || '')
        : String(item.text || item.topic || '');
    const text = rawText.replace(/\s+/g, ' ').trim().slice(0, 120);
    if (!text) continue;
    const score = typeof item.score === 'number' ? `, score ${item.score}` : '';
    rows.push(`${rows.length + 1}) ${kind}: ${text}${score}`);
    if (rows.length >= limit) break;
  }
  return rows.join('\n');
}

function extractRecurringKeywords(items, limit = 5) {
  const stopwords = new Set([
    'и', 'в', 'во', 'на', 'но', 'а', 'что', 'это', 'как', 'к', 'ко', 'с', 'со', 'по', 'из', 'у', 'о', 'об', 'от',
    'для', 'же', 'ли', 'не', 'ни', 'да', 'или', 'то', 'бы', 'только', 'уже', 'ещё', 'все', 'всё', 'мы', 'вы', 'они',
    'он', 'она', 'оно', 'я', 'ты', 'мой', 'твой', 'наш', 'ваш', 'его', 'её', 'их', 'the', 'a', 'an', 'of', 'to',
    'in', 'on', 'for', 'and', 'or', 'is', 'are', 'be',
  ]);
  const counts = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    if (!item || typeof item !== 'object') continue;
    const rawText = String(item.text || item.prompt || item.topic || '').toLowerCase();
    const words = rawText
      .replace(/[^a-zа-я0-9ё]+/gi, ' ')
      .split(/\s+/)
      .map((w) => w.trim())
      .filter((w) => w.length > 3 && !stopwords.has(w));
    for (const word of words) {
      counts.set(word, (counts.get(word) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word]) => word);
}

function buildRepeatAvoidanceDirective(recentHistory) {
  const recurring = extractRecurringKeywords(recentHistory, 5);
  if (!recurring.length) return '';
  return `Часто встречающиеся темы из недавних публикаций: ${recurring.join(', ')}. Не копируй эти углы буквально, а найди новый заход и свежую подачу.`;
}

function baseAngleId(angle) {
  return String(angle || '').trim().split(':')[0] || '';
}

function historySignalScore(item) {
  const score = Number(item?.score) || 0;
  const copiedCount = Number(item?.copiedCount) || 0;
  const publishCount = Number(item?.publishCount) || 0;
  const downloadCount = Number(item?.downloadCount) || 0;
  const variantBCount = Number(item?.variantBCount) || 0;
  const openedCount = Number(item?.openedCount) || 0;
  return score / 18 + copiedCount * 2.5 + publishCount * 3 + downloadCount * 2 + variantBCount * 1.5 + Math.min(openedCount, 3) * 0.5;
}

function buildLearnedPreferenceDirective(recentHistory, kind = 'text') {
  const items = (Array.isArray(recentHistory) ? recentHistory : [])
    .filter((item) => item && typeof item === 'object' && (!kind || item.type === kind))
    .map((item) => ({ ...item, signal: historySignalScore(item) }))
    .filter((item) => item.signal >= 4 || (Number(item.score) || 0) >= 75);
  if (!items.length) return '';

  const topItems = [...items].sort((a, b) => b.signal - a.signal).slice(0, 3);
  const lines = [];

  if (kind === 'text') {
    const angleCounts = new Map();
    const textLengths = [];
    for (const item of topItems) {
      const angle = baseAngleId(item.selectedAngle);
      if (angle) angleCounts.set(angle, (angleCounts.get(angle) || 0) + 1);
      const textLength = String(item.text || '').trim().length;
      if (textLength) textLengths.push(textLength);
    }
    const favoriteAngles = [...angleCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([angle]) => angle);
    if (favoriteAngles.length) {
      lines.push(`Что уже заходит у автора: чаще срабатывают углы ${favoriteAngles.join(', ')}.`);
    }
    if (textLengths.length) {
      const avgLength = Math.round(textLengths.reduce((sum, value) => sum + value, 0) / textLengths.length);
      if (avgLength <= 420) lines.push('Похоже, лучше работают короткие и плотные тексты без затяжного вступления.');
      if (avgLength >= 700) lines.push('Похоже, аудитория выдерживает более развёрнутую подачу, если в ней много конкретики.');
    }
    const goalCounts = new Map();
    for (const item of topItems) {
      const goal = normalizeGoal(item.goal);
      if (goal && goal !== 'auto') {
        goalCounts.set(goal, (goalCounts.get(goal) || 0) + 1);
      }
    }
    const favoriteGoals = [...goalCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .filter(([, count]) => count >= 2)
      .slice(0, 2)
      .map(([goal]) => goalLabel(goal));
    if (favoriteGoals.length) {
      lines.push(`По удачным публикациям чаще заходят цели: ${favoriteGoals.join(', ')}.`);
    }
  }

  const examples = topItems
    .map((item) => String(item.text || item.prompt || item.topic || '').replace(/\s+/g, ' ').trim().slice(0, 90))
    .filter(Boolean);
  if (examples.length) {
    lines.push(`Ориентиры по удачным работам: ${examples.join(' | ')}.`);
  }

  return lines.join('\n');
}

function buildThinkingDirective({ recentHistory, risk, goal } = {}) {
  const memory = summarizeRecentHistory(recentHistory, 5);
  const repeatAvoidance = buildRepeatAvoidanceDirective(recentHistory);
  const learnedPreference = buildLearnedPreferenceDirective(recentHistory, 'text');
  const riskLine = riskInstruction(risk);
  const goalLine = goalInstruction(goal);
  const lines = [
    'Сначала внутренне оцени тему и выбери лучший угол подачи.',
    'Сравни как минимум 3 подхода и возьми самый сильный по хуку, конкретике и уместности для площадки.',
    'Если есть выбор, не бери самый очевидный вариант — выбирай более живой, точный и неожиданный.',
    'Проверь текст на банальные формулировки, повторяющиеся заходы и слишком гладкую пустоту.',
    'Если получается слишком общий текст, сделай его конкретнее через пример, наблюдение, контраст или мини-кейс.',
    'В ответе покажи только готовый результат, без объяснений, без черновиков и без списка вариантов.',
    'Если можно выбрать между шаблонным и живым вариантом, выбирай живой.',
    riskLine,
    goalLine,
  ];
  if (memory) {
    lines.push(`Память о последних публикациях:\n${memory}\nИспользуй это как анти-повтор, а не как шаблон.`);
  }
  if (repeatAvoidance) {
    lines.push(repeatAvoidance);
  }
  if (learnedPreference) {
    lines.push(`Сигналы по тому, что уже срабатывало:\n${learnedPreference}`);
  }
  return lines.join('\n');
}

function isSurpriseRequest(topic) {
  const t = String(topic || '').trim().toLowerCase();
  if (!t) return true;
  return [
    /^удиви(?: меня)?$/,
    /^удиви меня,?$/,
    /^surprise me$/,
    /^make me something$/,
    /^anything$/,
    /^something$/,
    /^что-нибудь$/,
    /^что-нибудь интересное$/,
    /^придумай что-нибудь$/,
    /^сделай что-нибудь$/,
    /^на твой выбор$/,
    /^не знаю$/,
    /^любой вариант$/,
    /^сам придумай$/,
  ].some((re) => re.test(t));
}

function normalizeIntent(intent) {
  const value = String(intent || '').trim().toLowerCase();
  return ['auto', 'sell', 'personal', 'explain', 'provocative', 'surprise'].includes(value) ? value : 'auto';
}

function normalizeGoal(goal) {
  const value = String(goal || '').trim().toLowerCase();
  return ['reach', 'trust', 'warmup', 'sale', 'auto'].includes(value) ? value : 'auto';
}

function normalizeRisk(risk) {
  const value = String(risk || '').trim().toLowerCase();
  return ['calm', 'balanced', 'bold'].includes(value) ? value : 'balanced';
}

function goalLabel(goal) {
  const normalized = normalizeGoal(goal);
  const map = {
    reach: 'охват',
    trust: 'доверие',
    warmup: 'прогрев',
    sale: 'продажа',
    auto: 'авто',
  };
  return map[normalized] || normalized;
}

function goalInstruction(goal) {
  const normalized = normalizeGoal(goal);
  if (normalized === 'reach') {
    return 'Цель поста: охват. Нужны сильный хук, эмоция, контраст и повод переслать.';
  }
  if (normalized === 'trust') {
    return 'Цель поста: доверие. Нужны ясность, честность, конкретика и ощущение компетентности.';
  }
  if (normalized === 'warmup') {
    return 'Цель поста: прогрев. Нужны близость, ценность, постепенное усиление и мягкий переход к действию.';
  }
  if (normalized === 'sale') {
    return 'Цель поста: продажа. Нужны выгода, оффер, снятие сомнений и понятный CTA.';
  }
  return 'Сначала сам выбери лучшую цель поста: охват, доверие, прогрев или продажа. Потом пиши под неё, а не по шаблону.';
}

function inferPostGoal({ topic, intent, profile, recentHistory, risk } = {}) {
  const normalizedIntent = normalizeIntent(intent);
  if (normalizedIntent === 'sell') return 'sale';

  const text = [
    String(topic || ''),
    String(profile?.niche || ''),
    String(profile?.brandMemory || ''),
    String(profile?.styleNote || ''),
  ]
    .join(' ')
    .toLowerCase();

  if (/(куп|продаж|цена|тариф|оффер|заказ|заказа|заявк|лид|оплат|подписк|доступ|регистр|демо|курс|вебинар|созвон|консультац|скидк)/.test(text)) {
    return 'sale';
  }
  if (normalizedIntent === 'provocative') return 'reach';
  if (normalizedIntent === 'personal') return 'trust';
  if (normalizedIntent === 'explain') return 'trust';

  const normalizedRisk = normalizeRisk(risk);
  if (normalizedRisk === 'bold') return 'reach';
  if (normalizedRisk === 'calm') return 'trust';

  const history = Array.isArray(recentHistory) ? recentHistory : [];
  const goalCounts = new Map();
  for (const item of history) {
    if (!item || typeof item !== 'object') continue;
    const goal = normalizeGoal(item.goal);
    if (goal && goal !== 'auto') {
      goalCounts.set(goal, (goalCounts.get(goal) || 0) + 1);
    }
  }
  const dominantGoal = [...goalCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (dominantGoal && goalCounts.get(dominantGoal) >= 3) {
    return dominantGoal;
  }

  if (/(истори|личн|опыт|ошибк|честно|наблюден|вывод|команд|мы с|я понял)/.test(text)) {
    return 'warmup';
  }
  if (/[?]|(как|почему|что если|разбор|объясн|гайд|инструк|чеклист|миф|правда|ошибк|совет)/.test(text)) {
    return 'trust';
  }
  if (String(topic || '').trim().length <= 48) {
    return 'reach';
  }
  return 'warmup';
}

function riskInstruction(risk) {
  const normalized = normalizeRisk(risk);
  if (normalized === 'calm') {
    return 'Подача спокойнее: меньше провокации, больше ясности, доверия и аккуратного темпа.';
  }
  if (normalized === 'bold') {
    return 'Подача смелее: сильнее хук, ярче контраст, острее формулировки и больше энергии, но без кликбейта ради кликбейта.';
  }
  return 'Подача сбалансированная: не слишком мягкая и не слишком агрессивная, с ясным хук-началом и нормальным темпом.';
}

function isSimpleTopic(topic) {
  const t = String(topic || '').trim();
  if (!t) return true;
  if (t.length <= 24) return true;
  if (!/[.!?:;\n]/.test(t) && t.split(/\s+/).length <= 4) return true;
  return false;
}

function intentInstruction(intent) {
  const normalized = normalizeIntent(intent);
  if (normalized === 'auto') {
    return 'Сначала сам выбери лучшую подачу для темы: история, разбор, контраст, инсайт, кейс, провокация, инструкция или список. Возьми не самый очевидный, а самый цепкий вариант.';
  }
  if (normalized === 'sell') return 'Сделай акцент на ценности, выгоде, оффере и желании попробовать.';
  if (normalized === 'personal') return 'Пиши как живой личный пост: ближе к опыту, наблюдению, привычке или честной истории.';
  if (normalized === 'explain') return 'Объясни тему просто, ясно и без общих фраз, чтобы понял даже новичок.';
  if (normalized === 'provocative') return 'Сделай заход смелее и острее, но не скатывайся в кликбейт ради кликбейта.';
  return '';
}

function buildSurpriseStudioPrompt({ platform, tone, profile, recentHistory, risk, goal }) {
  const pl = String(platform || 'Telegram');
  const tn = String(tone || 'вирусный');
  const ps = profileSuffix(profile);
  const thinking = buildThinkingDirective({ recentHistory, risk, goal });

  const platformTemplates = {
    Telegram: `Сделай готовый пост для Telegram.`,
    Instagram: `Сделай сильную подпись для Instagram, как будто это пост/карусель с вирусным заходом.`,
    TikTok: `Сделай короткий, цепкий сценарий для TikTok с сильным хуком и финальным CTA.`,
    'YouTube Shorts': `Сделай сценарий для YouTube Shorts с мощным хук-началом и понятной концовкой.`,
    YouTube: `Сделай вирусный план для YouTube-видео: заголовок, структура и CTA.`,
    'VK Клипы': `Сделай сценарий для VK Клипов с динамикой и быстрым удержанием внимания.`,
    'VK Видео': `Сделай структуру и название для VK Видео, чтобы хотелось нажать и досмотреть.`,
  };

  const platformInstruction = platformTemplates[pl] || `Сделай сильный пост для ${pl}.`;

  return `${thinking}

Пользователь просит удивить его. Не задавай уточняющих вопросов и не отвечай общими словами.
Придумай сам неожиданную, но релевантную идею под ${pl}, чтобы результат был готов к публикации сразу.
Тон: ${tn}.
${riskInstruction(risk)}
${platformInstruction}
Требования:
1. Сразу дай готовый результат, а не список идей.
2. Открой с очень сильного крючка.
3. Используй конкретику, а не общие фразы.
4. Сделай текст живым и нативным для площадки.
5. Если эмодзи усиливают ритм, добавь их, но не по привычке.
6. Заканчивай коротким CTA.
  7. Максимум 1000 символов.${ps}`;
}

function buildSurpriseImagePrompt({ aspectRatio, style, profile, recentHistory, risk }) {
  const ar = String(aspectRatio || '1:1');
  const styleText = String(style || '').trim();
  const ps = profileSuffix(profile);
  const memory = summarizeRecentHistory(recentHistory, 5);
  const thinking = buildThinkingDirective({ recentHistory, risk });
  return `${thinking}

Пользователь просит удивить его. Придумай неожиданную, но визуально сильную концепцию изображения для соцсетей.
Формат: ${ar}.
${riskInstruction(risk)}
${styleText ? `Желаемый стиль: ${styleText}.` : 'Сделай стиль современным, цепляющим и коммерчески сильным.'}
Требования:
1. Один главный объект или сцена, читаемая с первого взгляда.
2. Визуальный вау-эффект без перегруза деталями.
3. Высокая контрастность и чистая композиция.
4. Не добавляй лишний текст на изображение.
5. Подходит для публикации в соцсетях.
${memory ? `Память о последних публикациях:\n${memory}\nНе повторяй эти сюжеты буквально.` : ''}${ps}`;
}

function buildStudioTextPrompt({ topic, platform, tone, profile, intent, recentHistory, risk, goal }) {
  const t = String(topic || '').trim();
  const pl = String(platform || 'Telegram');
  const tn = String(tone || 'вирусный');
  const normalizedIntent = normalizeIntent(intent);
  const ps = profileSuffix(profile);
  const inferredGoal = normalizeGoal(goal) === 'auto'
    ? inferPostGoal({ topic: t, intent: normalizedIntent, profile, recentHistory, risk })
    : normalizeGoal(goal);
  const thinking = buildThinkingDirective({ recentHistory, risk, goal: inferredGoal });

  if (normalizedIntent === 'surprise' || isSurpriseRequest(t)) {
    return buildSurpriseStudioPrompt({ platform: pl, tone: tn, profile, recentHistory, risk, goal: inferredGoal });
  }

  const intentLine = intentInstruction(normalizedIntent);
  const simpleTopicLine = isSimpleTopic(t)
    ? 'Тема сформулирована очень кратко. Сам придумай сильный угол, конкретный заход, структуру и живой CTA вместо общих рассуждений.'
    : '';

  let prompt = `${thinking}

Ты эксперт по вирусному контенту для ${pl}. Тон: ${tn}. ${riskInstruction(risk)} Создай вирусный пост на тему: ${t}. ${intentLine} ${simpleTopicLine} Закончи призывом к действию. Максимум 1000 символов.${ps}`;

  if (pl === 'YouTube Shorts') {
    prompt = `${thinking}

Ты эксперт по YouTube Shorts. Создай сценарий для вирусного Shorts на тему: ${t}. Тон: ${tn}. 
      ${riskInstruction(risk)}
      ${intentLine}
      ${simpleTopicLine}
      Структура:
      1. Заголовок (крючок)
      2. Сценарий (3-5 кадров с описанием действий и текста)
      3. Описание и 5 тегов.${ps}`;
  } else if (pl === 'YouTube') {
    prompt = `${thinking}

Создай план для вирусного видео на YouTube. Тема: ${t}. Тон: ${tn}.
      ${riskInstruction(risk)}
      ${intentLine}
      ${simpleTopicLine}
      Включи:
      1. Кликабельный заголовок (3 варианта)
      2. Структура видео (вступление, основные пункты, финал)
      3. Описание для видео с ключевыми словами.${ps}`;
  } else if (pl === 'VK Клипы') {
    prompt = `${thinking}

Ты эксперт по VK Клипам. Создай сценарий для вирусного клипа на тему: ${t}. Тон: ${tn}.
      ${riskInstruction(risk)}
      ${intentLine}
      ${simpleTopicLine}
      Важно: Сделай акцент на динамичном начале (первые 2 секунды).
      Структура:
      1. Текст на экране в начале
      2. Описание действий и речи
      3. Список из 5 целевых хештегов для VK.${ps}`;
  } else if (pl === 'VK Видео') {
    prompt = `${thinking}

Ты эксперт по продвижению в VK Видео. Создай структуру для видео на тему: ${t}. Тон: ${tn}.
      ${riskInstruction(risk)}
      ${intentLine}
      ${simpleTopicLine}
      Включи:
      1. Название, оптимизированное под поиск VK
      2. Таймкоды (план видео)
      3. Описание для поста с видео.${ps}`;
  }

  return prompt;
}

function buildRewriteTextPrompt({ topic, platform, tone, profile, intent, recentHistory, draft, critic, risk, goal }) {
  const t = String(topic || '').trim();
  const pl = String(platform || 'Telegram');
  const tn = String(tone || 'вирусный');
  const normalizedIntent = normalizeIntent(intent);
  const ps = profileSuffix(profile);
  const inferredGoal = normalizeGoal(goal) === 'auto'
    ? inferPostGoal({ topic: t, intent: normalizedIntent, profile, recentHistory, risk })
    : normalizeGoal(goal);
  const thinking = buildThinkingDirective({ recentHistory, risk, goal: inferredGoal });
  const intentLine = intentInstruction(normalizedIntent) || 'Выбери лучшую подачу сам.';
  const memory = summarizeRecentHistory(recentHistory, 5);
  const draftText = String(draft || '').trim();
  const criticLine = critic && typeof critic === 'object'
    ? [
        critic.score != null ? `Оценка критика: ${critic.score}/100.` : '',
        critic.verdict ? `Вердикт критика: ${String(critic.verdict).trim()}` : '',
        Array.isArray(critic.issues) && critic.issues.length ? `Что исправить: ${critic.issues.join('; ')}.` : '',
        critic.rewriteBrief ? `Фокус правки: ${String(critic.rewriteBrief).trim()}` : '',
      ]
        .filter(Boolean)
        .join(' ')
    : '';

  return `${thinking}

Ты старший редактор. У тебя уже есть черновик поста, но задача не просто подправить его, а сделать заметно сильнее.
Платформа: ${pl}.
Тон: ${tn}.
Тема: ${t}.
${intentLine}
${riskInstruction(risk)}
${goalInstruction(inferredGoal)}
${ps}
${memory ? `Память о последних публикациях:\n${memory}\nНе повторяй эти заходы.` : ''}
${criticLine ? `\nОценка внутреннего критика:\n${criticLine}\n` : ''}

Что нужно сделать:
1. Сохрани смысл, если он хорош, но не бойся полностью перестроить подачу.
2. Сделай первый абзац сильнее и конкретнее.
3. Убери банальности, воду, общие слова и слишком “ровный” тон.
4. Добавь живость, конкретику и более цепкий ритм.
5. Проверь, нет ли повторов с предыдущими публикациями.
6. Верни только финальную версию без объяснений.
7. Максимум 1000 символов.

Черновик:
${draftText}`;
}

function profileImageHint(profile) {
  const ps = profileSuffix(profile);
  if (!ps.trim()) return '';
  return ps.replace(/^\n+/, ' ').trim();
}

function buildVisualThinkingDirective({ recentHistory } = {}) {
  const memory = summarizeRecentHistory(recentHistory, 4);
  const repeatAvoidance = buildRepeatAvoidanceDirective(recentHistory);
  const learnedPreference = buildLearnedPreferenceDirective(recentHistory, 'image');
  const lines = [
    'Сначала выбери самую сильную визуальную концепцию и композицию.',
    'Сравни минимум 3 идеи: крупный объект, сцену с контрастом и более кинематографичный вариант.',
    'Возьми наиболее читаемый и цепкий вариант, а не самый перегруженный.',
    'Подумай о фокусе, световом акценте, контрасте, цветовой паре и простоте формы.',
    'Избегай визуального шума и случайных второстепенных деталей.',
    'Если изображение может стать слишком общим, сделай его более конкретным через одну сильную сцену.',
    'В итоге нужен один мощный визуальный концепт, готовый к генерации.',
  ];
  if (memory) {
    lines.push(`Память о последних визуалах:\n${memory}\nНе повторяй эти сцены буквально.`);
  }
  if (repeatAvoidance) {
    lines.push(repeatAvoidance);
  }
  if (learnedPreference) {
    lines.push(`Что уже выглядело удачно для этого автора:\n${learnedPreference}`);
  }
  return lines.join('\n');
}

function buildImageGenerationPrompt({
  prompt,
  aspectRatio,
  style,
  profile,
  recentHistory,
  risk,
  surprise = false,
}) {
  const basePrompt = String(prompt || '').trim();
  const ar = String(aspectRatio || '1:1');
  const styleText = String(style || '').trim();
  const ps = profileImageHint(profile);
  const thinking = buildVisualThinkingDirective({ recentHistory });
  const surpriseLine = surprise
    ? 'Это режим surprise: придумай неочевидную, но уместную концепцию, которая цепляет с первого взгляда.'
    : 'Подай тему естественно, но сделай результат заметно сильнее, чем обычный прямой запрос.';

  return `${thinking}

${surpriseLine}
${riskInstruction(risk)}
Формат: ${ar}.
Исходная идея: ${basePrompt}
${styleText ? `Желаемый стиль: ${styleText}.` : 'Если стиль не задан, выбери коммерчески сильный визуальный стиль сам.'}

Что нужно учесть:
1. Один главный фокус.
2. Чистая композиция.
3. Сильный контраст и аккуратный свет.
4. Подходит для соцсетей и хорошо читается в маленьком размере.
5. Не добавляй лишний текст на изображение.
6. Не перегружай сцену.
7. Сделай вариант, который хочется остановить взглядом.${ps}`;
}

function buildImageCriticPrompt({ basePrompt, aspectRatio, style, recentHistory, profile, risk }) {
  const thinking = buildVisualThinkingDirective({ recentHistory, risk });
  const styleText = String(style || '').trim();
  const ps = profileImageHint(profile);
  return `${thinking}

Ты визуальный директор и редактор промптов для генерации изображений.
Твоя задача: переписать исходный image prompt так, чтобы он стал сильнее по композиции, контрасту, ясности сцены и свежести идеи.

Формат: ${String(aspectRatio || '1:1')}.
${riskInstruction(risk)}
${styleText ? `Желаемый стиль: ${styleText}.` : 'Стиль выбери сам, если это усиливает сцену.'}
${ps ? `Контекст бренда: ${ps}` : ''}

Что улучшить:
1. Сделай сцену более конкретной и читаемой.
2. Убери расплывчатые формулировки.
3. Усиль главный фокус, свет, цветовой контраст и глубину кадра.
4. Не добавляй текст на изображение без необходимости.
5. Не повторяй буквально недавние визуалы.
6. Верни только готовый финальный prompt на русском языке, без комментариев и без markdown.

Исходный prompt:
${String(basePrompt || '').trim()}`;
}

module.exports = {
  buildStudioTextPrompt,
  buildRewriteTextPrompt,
  buildSurpriseImagePrompt,
  buildImageGenerationPrompt,
  buildImageCriticPrompt,
  isSurpriseRequest,
  normalizeIntent,
  normalizeGoal,
  goalLabel,
  goalInstruction,
  inferPostGoal,
  profileSuffix,
  profileImageHint,
  summarizeRecentHistory,
  buildThinkingDirective,
  buildVisualThinkingDirective,
};
