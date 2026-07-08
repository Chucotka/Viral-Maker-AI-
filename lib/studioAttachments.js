const { estimateBase64Bytes } = require('./tempImageDownload');

const MAX_ATTACHMENTS = 2;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_TEXT_CHARS = 32000;

const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

const TEXT_EXT = new Set(['txt', 'md', 'csv', 'json', 'log']);

function stripBase64(dataBase64) {
  const raw = String(dataBase64 || '').trim();
  const m = raw.match(/^data:[^;]+;base64,(.+)$/i);
  return (m ? m[1] : raw).replace(/\s/g, '');
}

function inferTextMime(name) {
  const ext = String(name || '').split('.').pop().toLowerCase();
  if (ext === 'md') return 'text/markdown';
  if (ext === 'csv') return 'text/csv';
  return 'text/plain';
}

/**
 * @param {unknown} raw
 * @returns {{ type: 'text', name: string, content: string } | { type: 'image', mimeType: string, dataBase64: string, name?: string }}
 */
function normalizeOne(raw) {
  if (!raw || typeof raw !== 'object') return null;

  if (raw.type === 'text' || raw.content != null) {
    const content = String(raw.content ?? raw.text ?? '').trim();
    if (!content) return null;
    if (content.length > MAX_TEXT_CHARS) {
      const err = new Error(`Текстовый файл слишком большой (макс. ${MAX_TEXT_CHARS} символов).`);
      err.status = 400;
      throw err;
    }
    const name = String(raw.name || 'файл.txt').slice(0, 120);
    return { type: 'text', name, content };
  }

  const mimeType = String(raw.mimeType || raw.mime || '').toLowerCase().split(';')[0].trim();
  const dataBase64 = stripBase64(raw.dataBase64 || raw.data);
  if (!dataBase64) return null;

  if (!IMAGE_MIMES.has(mimeType)) {
    const err = new Error('Поддерживаются изображения JPEG, PNG, WebP, GIF.');
    err.status = 400;
    throw err;
  }
  if (estimateBase64Bytes(dataBase64) > MAX_IMAGE_BYTES) {
    const err = new Error('Изображение слишком большое (макс. 4 МБ).');
    err.status = 400;
    throw err;
  }
  return {
    type: 'image',
    mimeType,
    dataBase64,
    name: String(raw.name || 'image').slice(0, 120),
  };
}

/** @param {unknown} bodyAttachments */
function parseStudioAttachments(bodyAttachments) {
  if (!Array.isArray(bodyAttachments) || !bodyAttachments.length) return [];
  if (bodyAttachments.length > MAX_ATTACHMENTS) {
    const err = new Error(`Можно прикрепить не больше ${MAX_ATTACHMENTS} файлов.`);
    err.status = 400;
    throw err;
  }
  const out = [];
  for (const item of bodyAttachments) {
    const norm = normalizeOne(item);
    if (norm) out.push(norm);
  }
  const images = out.filter((a) => a.type === 'image');
  if (images.length > 1) {
    const err = new Error('За один раз — одно изображение.');
    err.status = 400;
    throw err;
  }
  return out;
}

function attachmentContextSuffix(attachments = []) {
  if (!attachments.length) return '';
  const lines = ['\n\n--- Вложения пользователя ---'];
  for (const a of attachments) {
    if (a.type === 'text') {
      lines.push(`Файл «${a.name}»:\n${a.content}`);
    }
  }
  const hasImage = attachments.some((a) => a.type === 'image');
  if (hasImage) {
    lines.push(
      'Пользователь также прикрепил изображение — учти визуальные детали (если видишь картинку) при переписывании или корректировке.',
    );
  }
  lines.push(
    'Сохрани смысл исходника, но улучши подачу согласно инструкции в теме выше (переписать, сократить, исправить, адаптировать под платформу).',
  );
  return lines.join('\n');
}

/** @returns {Array<{ text?: string, inlineData?: { mimeType: string, data: string } }> | null} */
function buildGeminiPartsFromAttachments(prompt, attachments = []) {
  const image = attachments.find((a) => a.type === 'image');
  if (!image) return null;
  const parts = [{ text: String(prompt || '') }];
  parts.push({
    inlineData: {
      mimeType: image.mimeType,
      data: image.dataBase64,
    },
  });
  return parts;
}

function hasReferenceImage(attachments = []) {
  return attachments.some((a) => a.type === 'image');
}

function imageReferencePromptSuffix() {
  return (
    ' The user attached a reference image — use it as visual guide. ' +
    'Follow their instructions to refine, restyle, or recreate the image while keeping key recognizable elements when asked.'
  );
}

module.exports = {
  MAX_ATTACHMENTS,
  MAX_IMAGE_BYTES,
  MAX_TEXT_CHARS,
  IMAGE_MIMES,
  TEXT_EXT,
  inferTextMime,
  parseStudioAttachments,
  attachmentContextSuffix,
  buildGeminiPartsFromAttachments,
  hasReferenceImage,
  imageReferencePromptSuffix,
  stripBase64,
};
