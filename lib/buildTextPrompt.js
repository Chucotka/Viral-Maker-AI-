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

function buildStudioTextPrompt({ topic, platform, tone, profile }) {
  const t = String(topic || '').trim();
  const pl = String(platform || 'Telegram');
  const tn = String(tone || 'вирусный');
  const ps = profileSuffix(profile);

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

module.exports = { buildStudioTextPrompt, profileSuffix, profileImageHint };
