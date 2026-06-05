/**
 * Сохранение картинки на устройство в Telegram Mini App.
 * На телефоне надёжнее всего: отправить фото в личный чат с ботом → долгое нажатие → «Сохранить в галерею».
 */
(function initVmImageDownload(global) {
  function extensionFromMime(mimeType) {
    const mt = String(mimeType || '').toLowerCase();
    if (mt.includes('jpeg') || mt.includes('jpg')) return 'jpg';
    if (mt.includes('webp')) return 'webp';
    return 'png';
  }

  function fileNameFromMime(mimeType) {
    return `viral-maker-ai.${extensionFromMime(mimeType)}`;
  }

  function isTelegramMobile(tg) {
    const p = String(tg?.platform || '').toLowerCase();
    return p === 'ios' || p === 'android' || p === 'android_x';
  }

  function canUseTelegramDownload(tg) {
    if (!tg || typeof tg.downloadFile !== 'function') return false;
    if (typeof tg.isVersionAtLeast === 'function') return tg.isVersionAtLeast('8.0');
    return true;
  }

  function dataUrlToBlob(dataUrl) {
    const m = /^data:([^;]+);base64,(.+)$/.exec(dataUrl || '');
    if (!m) return null;
    const binary = atob(m[2]);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: m[1] });
  }

  function parseDataUrl(dataUrl) {
    const m = /^data:([^;]+);base64,(.+)$/.exec(dataUrl || '');
    if (!m) return null;
    return { mimeType: m[1], imageBase64: m[2] };
  }

  function telegramDownloadFile(tg, url, fileName) {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (v) => {
        if (settled) return;
        settled = true;
        resolve(!!v);
      };
      setTimeout(() => finish(false), 90_000);
      const params = { url: String(url), file_name: String(fileName) };
      try {
        if (tg.downloadFile.length >= 2) {
          tg.downloadFile(params, (accepted) => finish(accepted !== false));
          return;
        }
        const ret = tg.downloadFile(params);
        if (ret && typeof ret.then === 'function') {
          ret.then(() => finish(true)).catch(() => finish(false));
          return;
        }
        finish(true);
      } catch {
        finish(false);
      }
    });
  }

  function openDownloadLink(tg, url) {
    if (!url) return false;
    try {
      if (typeof tg.openLink === 'function') {
        tg.openLink(url, { try_instant_view: false });
        return true;
      }
    } catch {
      /* ignore */
    }
    try {
      global.open(url, '_blank', 'noopener');
      return true;
    } catch {
      return false;
    }
  }

  function showBotChatSavePopup(tg, chatLink) {
    const buttons = chatLink
      ? [
          { id: 'open_chat', type: 'default', text: 'Открыть чат с ботом' },
          { id: 'ok', type: 'ok', text: 'Понятно' },
        ]
      : [{ id: 'ok', type: 'ok', text: 'Понятно' }];

    const message =
      'Фото отправлено в личный чат с ботом.\n\n' +
      '1. Откройте чат с ботом\n' +
      '2. Нажмите и удерживайте картинку\n' +
      '3. Выберите «Сохранить в галерею» / «Save to Photos»';

    if (typeof tg.showPopup === 'function') {
      tg.showPopup({ title: 'Сохранить в галерею', message, buttons }, (buttonId) => {
        if (buttonId === 'open_chat' && chatLink && typeof tg.openTelegramLink === 'function') {
          tg.openTelegramLink(chatLink);
        }
      });
      return;
    }
    tg.showAlert?.(message);
  }

  async function requestSendImageToBotChat({ getHeaders, downloadToken, imageBase64, mimeType }) {
    const body = { mimeType: mimeType || 'image/png' };
    if (downloadToken) body.downloadToken = downloadToken;
    else if (imageBase64) body.imageBase64 = imageBase64;
    else return { ok: false, message: 'Нет данных изображения.' };

    const res = await fetch('/api/image-download', {
      method: 'POST',
      headers: getHeaders ? getHeaders() : { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, action: 'send' }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, message: data.message || data.error || 'Не удалось отправить фото в чат.' };
    }
    return { ok: true, chatLink: data.chatLink || null };
  }

  async function ensureDownloadUrl(opts, parsed, fileName) {
    if (opts.downloadUrl) {
      return { url: opts.downloadUrl, fileName: opts.downloadFileName || fileName, token: opts.downloadToken || null };
    }
    if (!parsed?.imageBase64) return null;
    const res = await fetch('/api/image-download', {
      method: 'POST',
      headers: opts.getHeaders ? opts.getHeaders() : { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageBase64: parsed.imageBase64,
        mimeType: parsed.mimeType,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.downloadUrl) {
      opts.onError?.(data.message || data.error || 'Не удалось подготовить файл.');
      return null;
    }
    return { url: data.downloadUrl, fileName: data.fileName || fileName, token: data.token || null };
  }

  async function shareBlobFallback(blob, fileName) {
    if (!blob || !global.navigator?.share) return false;
    try {
      const file = new File([blob], fileName, { type: blob.type || 'image/png' });
      if (global.navigator.canShare && !global.navigator.canShare({ files: [file] })) return false;
      await global.navigator.share({ files: [file], title: 'Viral Maker AI' });
      return true;
    } catch (e) {
      if (e && e.name === 'AbortError') return true;
      return false;
    }
  }

  /**
   * @param {object} opts
   */
  async function saveGeneratedImageToDevice(opts) {
    const { dataUrl, mimeType, tg, getHeaders, onError } = opts || {};
    const parsed = parseDataUrl(dataUrl);
    if (!parsed) {
      onError?.('Нет изображения для сохранения.');
      return false;
    }
    const fileName = opts.downloadFileName || fileNameFromMime(mimeType || parsed.mimeType);
    const mobile = isTelegramMobile(tg);

    const prepared = await ensureDownloadUrl(opts, parsed, fileName);
    const downloadUrl = prepared?.url || opts.downloadUrl || null;
    const downloadToken = prepared?.token || opts.downloadToken || null;

    // 1) Мобильный Telegram: сначала отправка в личный чат (самый надёжный способ «в галерею»)
    if (mobile) {
      try {
        const sent = await requestSendImageToBotChat({
          getHeaders,
          downloadToken,
          imageBase64: parsed.imageBase64,
          mimeType: parsed.mimeType,
        });
        if (sent.ok) {
          showBotChatSavePopup(tg, sent.chatLink);
          return true;
        }
        onError?.(sent.message);
      } catch {
        /* try other methods */
      }
    }

    // 2) Нативный downloadFile (Bot API 8.0+)
    if (downloadUrl && canUseTelegramDownload(tg)) {
      const ok = await telegramDownloadFile(tg, downloadUrl, fileName);
      if (ok) {
        tg.showAlert?.('Подтвердите сохранение в системном окне Telegram.');
        return true;
      }
    }

    // 3) Открыть HTTPS-файл во внешнем браузере
    if (downloadUrl && openDownloadLink(tg, downloadUrl)) {
      tg.showAlert?.(
        'Файл открыт. В браузере нажмите «Скачать» или удерживайте изображение → «Сохранить».',
      );
      return true;
    }

    // 4) Десктоп / web: отправка в чат с ботом
    if (!mobile) {
      try {
        const sent = await requestSendImageToBotChat({
          getHeaders,
          downloadToken,
          imageBase64: parsed.imageBase64,
          mimeType: parsed.mimeType,
        });
        if (sent.ok) {
          showBotChatSavePopup(tg, sent.chatLink);
          return true;
        }
      } catch {
        /* ignore */
      }
    }

    const blob = dataUrlToBlob(dataUrl);
    if (await shareBlobFallback(blob, fileName)) return true;

    onError?.(
      'Сохраните вручную: удерживайте превью картинки в студии → «Сохранить изображение». ' +
        'Или напишите боту /start и нажмите «Сохранить в галерею» снова.',
    );
    return false;
  }

  global.VMImageDownload = {
    saveGeneratedImageToDevice,
    fileNameFromMime,
    canUseTelegramDownload,
    isTelegramMobile,
  };
})(typeof window !== 'undefined' ? window : globalThis);
