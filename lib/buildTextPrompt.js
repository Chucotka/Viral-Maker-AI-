/**
 * @param {{ niche?: string, language?: string, styleNote?: string }} profile — из записи пользователя KV
 */
function profileSuffix(profile) {
  if (!profile || typeof profile !== 'object') return '';
  const parts = [];
  const niche = String(profile.niche || '').trim();
  const language = String(profile.language || '').trim();
  const styleNote = String(profile.styleNote || '').trim();
  if (niche) parts.push(`Ниша автора: ${niche}.`);
  if (language) parts.push(`Язык ответа: ${language}.`);
  if (styleNote) parts.push(`Стиль и ограничения: ${styleNote}.`);
  if (!parts.length) return '';
  return `\n\n${parts.join(' ')}\n`;
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

function buildSurpriseStudioPrompt({ platform, tone, profile }) {
  const pl = String(platform || 'Telegram');
  const tn = String(tone || 'вирусный');
  const ps = profileSuffix(profile);

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

  return `Пользователь просит удивить его. Не задавай уточняющих вопросов и не отвечай общими словами.
Придумай сам неожиданную, но релевантную идею под ${pl}, чтобы результат был готов к публикации сразу.
Тон: ${tn}.
${platformInstruction}
Требования:
1. Сразу дай готовый результат, а не список идей.
2. Открой с очень сильного крючка.
3. Используй конкретику, а не общие фразы.
4. Сделай текст живым и нативным для площадки.
5. Если уместно, добавь 3-5 эмодзи.
6. Заканчивай коротким CTA.
7. Максимум 1000 символов.${ps}`;
}

function buildSurpriseImagePrompt({ aspectRatio, style, profile }) {
  const ar = String(aspectRatio || '1:1');
  const styleText = String(style || '').trim();
  const ps = profileSuffix(profile);
  return `Пользователь просит удивить его. Придумай неожиданную, но визуально сильную концепцию изображения для соцсетей.
Формат: ${ar}.
${styleText ? `Желаемый стиль: ${styleText}.` : 'Сделай стиль современным, цепляющим и коммерчески сильным.'}
Требования:
1. Один главный объект или сцена, читаемая с первого взгляда.
2. Визуальный вау-эффект без перегруза деталями.
3. Высокая контрастность и чистая композиция.
4. Не добавляй лишний текст на изображение.
5. Подходит для публикации в соцсетях.${ps}`;
}

function buildStudioTextPrompt({ topic, platform, tone, profile }) {
  const t = String(topic || '').trim();
  const pl = String(platform || 'Telegram');
  const tn = String(tone || 'вирусный');
  const ps = profileSuffix(profile);

  if (isSurpriseRequest(t)) {
    return buildSurpriseStudioPrompt({ platform: pl, tone: tn, profile });
  }

  let prompt = `Ты эксперт по вирусному контенту для ${pl}. Тон: ${tn}. Создай вирусный пост на тему: ${t}. Добавь 3-5 эмодзи. Закончи призывом к действию. Максимум 1000 символов.${ps}`;

  if (pl === 'YouTube Shorts') {
    prompt = `Ты эксперт по YouTube Shorts. Создай сценарий для вирусного Shorts на тему: ${t}. Тон: ${tn}. 
      Структура:
      1. Заголовок (крючок)
      2. Сценарий (3-5 кадров с описанием действий и текста)
      3. Описание и 5 тегов.${ps}`;
  } else if (pl === 'YouTube') {
    prompt = `Создай план для вирусного видео на YouTube. Тема: ${t}. Тон: ${tn}.
      Включи:
      1. Кликабельный заголовок (3 варианта)
      2. Структура видео (вступление, основные пункты, финал)
      3. Описание для видео с ключевыми словами.${ps}`;
  } else if (pl === 'VK Клипы') {
    prompt = `Ты эксперт по VK Клипам. Создай сценарий для вирусного клипа на тему: ${t}. Тон: ${tn}.
      Важно: Сделай акцент на динамичном начале (первые 2 секунды).
      Структура:
      1. Текст на экране в начале
      2. Описание действий и речи
      3. Список из 5 целевых хештегов для VK.${ps}`;
  } else if (pl === 'VK Видео') {
    prompt = `Ты эксперт по продвижению в VK Видео. Создай структуру для видео на тему: ${t}. Тон: ${tn}.
      Включи:
      1. Название, оптимизированное под поиск VK
      2. Таймкоды (план видео)
      3. Описание для поста с видео.${ps}`;
  }

  return prompt;
}

function profileImageHint(profile) {
  const ps = profileSuffix(profile);
  if (!ps.trim()) return '';
  return ps.replace(/^\n+/, ' ').trim();
}

module.exports = {
  buildStudioTextPrompt,
  buildSurpriseImagePrompt,
  isSurpriseRequest,
  profileSuffix,
  profileImageHint,
};
