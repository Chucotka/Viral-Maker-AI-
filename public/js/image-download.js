/**
 * Сохранение сгенерированной картинки на устройство (галерея / файлы).
 * В Telegram Mini App <a download> с data: URL не работает — нужен WebApp.downloadFile + HTTPS.
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

  function canUseTelegramDownload(tg) {
    return !!(tg && typeof tg.downloadFile === 'function');
  }

  function dataUrlToBlob(dataUrl) {
    const m = /^data:([^;]+);base64,(.+)$/.exec(dataUrl || '');
    if (!m) return null;
    const binary = atob(m[2]);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: m[1] });
  }

  async function shareBlobFallback(tg, blob, fileName) {
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

  function anchorBlobFallback(blob, fileName) {
    if (!blob) return false;
    try {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      return true;
    } catch {
      return false;
    }
  }

  function telegramDownloadFile(tg, url, fileName) {
    return new Promise((resolve) => {
      try {
        tg.downloadFile({ url, file_name: fileName }, (accepted) => {
          resolve(accepted !== false);
        });
      } catch {
        resolve(false);
      }
    });
  }

  /**
   * @param {object} opts
   * @param {string} opts.dataUrl
   * @param {string} [opts.mimeType]
   * @param {object} opts.tg - Telegram.WebApp
   * @param {() => object} opts.getHeaders - auth headers for POST
   * @param {(msg: string) => void} [opts.onError]
   */
  async function saveGeneratedImageToDevice(opts) {
    const { dataUrl, mimeType, tg, getHeaders, onError } = opts || {};
    const fileName = fileNameFromMime(mimeType);
    const parts = /^data:([^;]+);base64,(.+)$/.exec(dataUrl || '');
    if (!parts) {
      onError?.('Нет изображения для сохранения.');
      return false;
    }
    const imageBase64 = parts[2];
    const resolvedMime = mimeType || parts[1] || 'image/png';

    if (canUseTelegramDownload(tg)) {
      try {
        const res = await fetch('/api/image-download', {
          method: 'POST',
          headers: getHeaders ? getHeaders() : { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64, mimeType: resolvedMime }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          onError?.(data.message || data.error || 'Не удалось подготовить файл.');
        } else if (data.downloadUrl) {
          const ok = await telegramDownloadFile(tg, data.downloadUrl, data.fileName || fileName);
          if (ok) return true;
        }
      } catch {
        /* fallback below */
      }
    }

    const blob = dataUrlToBlob(dataUrl);
    if (await shareBlobFallback(tg, blob, fileName)) return true;
    if (anchorBlobFallback(blob, fileName)) {
      tg?.showAlert?.(
        'Если файл не появился в галерее: нажмите и удерживайте превью картинки выше → «Сохранить изображение».',
      );
      return true;
    }

    onError?.('Сохранение недоступно в этом клиенте. Удерживайте превью картинки → «Сохранить изображение».');
    return false;
  }

  global.VMImageDownload = {
    saveGeneratedImageToDevice,
    fileNameFromMime,
    canUseTelegramDownload,
  };
})(typeof window !== 'undefined' ? window : globalThis);
