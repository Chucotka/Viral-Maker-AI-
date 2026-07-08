/**
 * Вложения в студии: текстовые файлы и изображения → JSON для /api/generate*.
 */
(function initStudioAttachments(global) {
  const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
  const MAX_TEXT_CHARS = 32000;
  const TEXT_EXT = new Set(['txt', 'md', 'csv', 'json', 'log']);

  /** @type {Array<object>} */
  let items = [];

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
      reader.readAsDataURL(file);
    });
  }

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
      reader.readAsText(file, 'UTF-8');
    });
  }

  function isTextFile(file) {
    const name = String(file.name || '').toLowerCase();
    const ext = name.split('.').pop();
    if (TEXT_EXT.has(ext)) return true;
    return (file.type || '').startsWith('text/');
  }

  function isImageFile(file) {
    return (file.type || '').startsWith('image/');
  }

  async function fileToAttachment(file) {
    if (file.size > MAX_IMAGE_BYTES && isImageFile(file)) {
      throw new Error('Изображение больше 4 МБ. Сожмите файл или выберите другое.');
    }
    if (isTextFile(file)) {
      const content = (await readFileAsText(file)).trim();
      if (!content) throw new Error('Файл пустой.');
      if (content.length > MAX_TEXT_CHARS) {
        throw new Error(`Текст слишком длинный (макс. ${MAX_TEXT_CHARS} символов).`);
      }
      return { type: 'text', name: file.name, content };
    }
    if (isImageFile(file)) {
      const dataUrl = await readFileAsDataUrl(file);
      const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!m) throw new Error('Неверный формат изображения.');
      const mimeType = m[1];
      const dataBase64 = m[2];
      const bytes = Math.floor((dataBase64.length * 3) / 4);
      if (bytes > MAX_IMAGE_BYTES) throw new Error('Изображение больше 4 МБ.');
      return { type: 'image', mimeType, dataBase64, name: file.name };
    }
    throw new Error('Поддерживаются .txt, .md, .csv и изображения (JPEG, PNG, WebP, GIF).');
  }

  function renderList() {
    const list = global.document?.getElementById('studio-attachment-list');
    if (!list) return;
    list.innerHTML = '';
    if (!items.length) {
      list.classList.add('hidden');
      return;
    }
    list.classList.remove('hidden');
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      const li = global.document.createElement('li');
      li.className = 'studio-attachment-item';
      const label =
        item.type === 'text'
          ? `📄 ${item.name}`
          : `🖼 ${item.name || 'изображение'}`;
      li.innerHTML = `<span class="studio-attachment-label">${label}</span>`;
      const btn = global.document.createElement('button');
      btn.type = 'button';
      btn.className = 'studio-attachment-remove';
      btn.textContent = '✕';
      btn.setAttribute('aria-label', 'Удалить вложение');
      btn.addEventListener('click', () => {
        items.splice(i, 1);
        renderList();
      });
      li.appendChild(btn);
      if (item.type === 'image' && item.previewUrl) {
        const img = global.document.createElement('img');
        img.src = item.previewUrl;
        img.alt = '';
        img.className = 'studio-attachment-thumb';
        li.insertBefore(img, btn);
      }
      list.appendChild(li);
    }
  }

  async function addFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    if (items.length + files.length > 2) {
      throw new Error('Можно прикрепить не больше 2 файлов.');
    }
    const next = [...items];
    for (const file of files) {
      const att = await fileToAttachment(file);
      if (att.type === 'image' && next.some((x) => x.type === 'image')) {
        throw new Error('За один раз — одно изображение.');
      }
      if (att.type === 'image') {
        att.previewUrl = `data:${att.mimeType};base64,${att.dataBase64}`;
      }
      next.push(att);
    }
    items = next;
    renderList();
  }

  function getPayloadAttachments() {
    return items.map((item) => {
      if (item.type === 'text') {
        return { type: 'text', name: item.name, content: item.content };
      }
      return { type: 'image', mimeType: item.mimeType, dataBase64: item.dataBase64, name: item.name };
    });
  }

  function clear() {
    items = [];
    renderList();
    const input = global.document?.getElementById('studio-attachment-input');
    if (input) input.value = '';
  }

  function install() {
    const btn = global.document?.getElementById('btn-studio-attach');
    const input = global.document?.getElementById('studio-attachment-input');
    if (!btn || !input) return;

    btn.addEventListener('click', () => input.click());
    input.addEventListener('change', async () => {
      try {
        await addFiles(input.files);
      } catch (e) {
        (global.VMRuntime?.alert || global.alert)?.(e.message || 'Ошибка файла');
      } finally {
        input.value = '';
      }
    });
    renderList();
  }

  global.VMStudioAttachments = {
    install,
    clear,
    getPayloadAttachments,
    hasAttachments: () => items.length > 0,
  };

  if (global.document?.readyState === 'loading') {
    global.document.addEventListener('DOMContentLoaded', install);
  } else {
    install();
  }
})(window);
