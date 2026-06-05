/**
 * Сохранение картинки на телефон в Telegram Mini App.
 * В WebView долгое нажатие на превью НЕ даёт «Сохранить в галерею» — только в нативном чате Telegram.
 */
(function initVmImageDownload(global) {
  const PENDING_SAVE_KEY = 'vm_pending_save_token';

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

  function rememberPendingSaveToken(token) {
    if (!token) return;
    try {
      global.sessionStorage.setItem(PENDING_SAVE_KEY, String(token));
    } catch {
      /* ignore */
    }
  }

  function readPendingSaveToken() {
    try {
      return global.sessionStorage.getItem(PENDING_SAVE_KEY) || '';
    } catch {
      return '';
    }
  }

  function clearPendingSaveToken() {
    try {
      global.sessionStorage.removeItem(PENDING_SAVE_KEY);
    } catch {
      /* ignore */
    }
  }

  function openTelegramUrl(tg, url) {
    if (!url) return false;
    try {
      if (typeof tg.openTelegramLink === 'function') {
        tg.openTelegramLink(url);
        return true;
      }
    } catch {
      /* ignore */
    }
    try {
      if (typeof tg.openLink === 'function') {
        tg.openLink(url);
        return true;
      }
    } catch {
      /* ignore */
    }
    return false;
  }

  function telegramDownloadFile(tg, url, fileName) {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (v) => {
        if (settled) return;
        settled = true;
        resolve(!!v);
      };
      setTimeout(() => finish(false), 45_000);
      const params = { url: String(url), file_name: String(fileName) };
      try {
        if (tg.downloadFile.length >= 2) {
          tg.downloadFile(params, (accepted) => finish(accepted === true));
          return;
        }
        const ret = tg.downloadFile(params);
        if (ret && typeof ret.then === 'function') {
          ret.then(() => finish(true)).catch(() => finish(false));
          return;
        }
        finish(false);
      } catch {
        finish(false);
      }
    });
  }

  function showPopup(tg, title, message, buttons, callback) {
    if (typeof tg.showPopup === 'function') {
      tg.showPopup({ title, message, buttons }, callback);
      return;
    }
    tg.showAlert?.(message);
  }

  function showBotDeliveryPopup(tg, chatLink) {
    const buttons = chatLink
      ? [
          { id: 'open_chat', type: 'default', text: 'Открыть чат с ботом' },
          { id: 'ok', type: 'ok', text: 'Понятно' },
        ]
      : [{ id: 'ok', type: 'ok', text: 'Понятно' }];
    showPopup(
      tg,
      'Картинка в чате',
      'Фото отправлено в личный чат с ботом.\n\n' +
        '1. Откройте чат с ботом\n' +
        '2. Удерживайте изображение в чате (не в студии!)\n' +
        '3. «Сохранить в галерею» / «Save to Photos»\n\n' +
        'Если пришёл файл — нажмите на него → «Скачать».',
      buttons,
      (buttonId) => {
        if (buttonId === 'open_chat') openTelegramUrl(tg, chatLink);
      },
    );
  }

  function showNeedsStartPopup(tg, startLink) {
    const buttons = startLink
      ? [
          { id: 'open_bot', type: 'default', text: 'Открыть бота' },
          { id: 'ok', type: 'ok', text: 'Понятно' },
        ]
      : [{ id: 'ok', type: 'ok', text: 'Понятно' }];
    showPopup(
      tg,
      'Шаг 1 из 2',
      'Чтобы сохранить картинку, бот отправит её в личный чат.\n\n' +
        '1. Нажмите «Открыть бота»\n' +
        '2. В чате нажмите Start / Запустить\n' +
        '3. Картинка придёт в чат — удержите её → «Сохранить в галерею»\n\n' +
        'В превью студии сохранение недоступно — только в чате с ботом.',
      buttons,
      (buttonId) => {
        if (buttonId === 'open_bot') openTelegramUrl(tg, startLink);
      },
    );
  }

  async function requestSendImageToBotChat({ getHeaders, downloadToken, mimeType }) {
    if (!downloadToken) {
      return { ok: false, message: 'Нет токена файла. Сгенерируйте картинку заново.' };
    }

    const res = await fetch('/api/image-download', {
      method: 'POST',
      headers: getHeaders ? getHeaders() : { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'send', downloadToken, mimeType: mimeType || 'image/png' }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false,
        message: data.message || data.error || 'Не удалось отправить фото в чат.',
        needsStart: !!data.needsStart,
        startLink: data.startLink || null,
        downloadToken: data.downloadToken || downloadToken,
      };
    }
    clearPendingSaveToken();
    return { ok: true, chatLink: data.chatLink || data.startLink || null };
  }

  async function ensureDownloadUrl(opts, parsed, fileName) {
    if (opts.downloadUrl) {
      return {
        url: opts.downloadUrl,
        fileName: opts.downloadFileName || fileName,
        token: opts.downloadToken || null,
      };
    }
    const token = opts.downloadToken || readPendingSaveToken();
    if (token) {
      const base = String(global.location?.origin || '').replace(/\/$/, '');
      if (base) {
        return {
          url: `${base}/api/image-download?t=${encodeURIComponent(token)}`,
          fileName,
          token,
        };
      }
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
      return {
        error: data.message || data.error || 'Не удалось подготовить файл.',
      };
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

  async function saveGeneratedImageToDevice(opts) {
    const { dataUrl, mimeType, tg, getHeaders, onError } = opts || {};
    const parsed = parseDataUrl(dataUrl);
    if (!parsed) {
      onError?.('Нет изображения для сохранения.');
      return false;
    }
    const fileName = opts.downloadFileName || fileNameFromMime(mimeType || parsed.mimeType);
    let downloadToken = opts.downloadToken || readPendingSaveToken() || null;

    const prepared = await ensureDownloadUrl({ ...opts, downloadToken }, parsed, fileName);
    if (prepared?.error) {
      onError?.(prepared.error);
      return false;
    }
    const downloadUrl = prepared?.url || opts.downloadUrl || null;
    downloadToken = prepared?.token || downloadToken;
    if (downloadToken) rememberPendingSaveToken(downloadToken);

    // 1) Отправка в личный чат с ботом — единственный надёжный путь «в галерею» на телефоне
    try {
      const sent = await requestSendImageToBotChat({
        getHeaders,
        downloadToken,
        mimeType: parsed.mimeType,
      });
      if (sent.ok) {
        showBotDeliveryPopup(tg, sent.chatLink);
        return true;
      }
      if (sent.needsStart && sent.startLink) {
        rememberPendingSaveToken(sent.downloadToken || downloadToken);
        openTelegramUrl(tg, sent.startLink);
        showNeedsStartPopup(tg, sent.startLink);
        return false;
      }
      if (sent.message) onError?.(sent.message);
    } catch (e) {
      console.error('send to bot failed', e);
    }

    // 2) Нативный downloadFile (если поддерживается)
    if (downloadUrl && canUseTelegramDownload(tg)) {
      const ok = await telegramDownloadFile(tg, downloadUrl, fileName);
      if (ok) {
        showPopup(
          tg,
          'Сохранение',
          'Подтвердите сохранение в системном окне Telegram.',
          [{ id: 'ok', type: 'ok', text: 'Понятно' }],
        );
        clearPendingSaveToken();
        return true;
      }
    }

    // 3) Открыть файл во внешнем браузере
    if (downloadUrl && openTelegramUrl(tg, downloadUrl)) {
      tg.showAlert?.('Файл открыт. Удерживайте изображение → «Сохранить» / «Download».');
      return true;
    }

    const blob = dataUrlToBlob(dataUrl);
    if (await shareBlobFallback(blob, fileName)) {
      clearPendingSaveToken();
      return true;
    }

    onError?.(
      'Автосохранение не сработало.\n\n' +
        'Нажмите «Сохранить в галерею» ещё раз. Если бот просит Start — откройте бота и нажмите Запустить.\n' +
        'Сохранять нужно в чате с ботом, не в превью студии.',
    );
    return false;
  }

  async function retryPendingSaveIfAny(opts) {
    const token = readPendingSaveToken();
    if (!token || !opts?.getHeaders) return false;
    try {
      const sent = await requestSendImageToBotChat({
        getHeaders: opts.getHeaders,
        downloadToken: token,
        mimeType: 'image/png',
      });
      if (sent.ok) {
        showBotDeliveryPopup(opts.tg, sent.chatLink);
        return true;
      }
    } catch {
      /* ignore */
    }
    return false;
  }

  global.VMImageDownload = {
    saveGeneratedImageToDevice,
    retryPendingSaveIfAny,
    fileNameFromMime,
    canUseTelegramDownload,
    isTelegramMobile,
    readPendingSaveToken,
    clearPendingSaveToken,
  };
})(typeof window !== 'undefined' ? window : globalThis);
