/**
 * История генераций: слияние с сервером и отдельное хранение dataUrl картинок (лимит localStorage).
 */
(function initVmHistoryStore(global) {
  const IMAGE_BLOB_KEY = 'vm_history_images_v1';
  const MAX_BLOBS = 30;

  function historyItemKey(item) {
    const ts = item && typeof item.ts === 'number' ? item.ts : '';
    const type = String(item?.type || '');
    if (type === 'image') return `${ts}|image`;
    const text = String(item?.text || item?.prompt || item?.topic || '');
    return `${ts}|${type}|${text}`;
  }

  function mergeHistoryItem(prev, next) {
    const merged = { ...prev, ...next };
    const type = merged.type || prev.type || next.type;
    if (type !== 'image') return merged;
    merged.dataUrl = next.dataUrl || prev.dataUrl || merged.dataUrl;
    merged.mimeType = next.mimeType || prev.mimeType || merged.mimeType;
    const pPrev = String(prev.prompt || '');
    const pNext = String(next.prompt || '');
    merged.prompt = pNext.length > pPrev.length ? pNext : pPrev || merged.prompt;
    return merged;
  }

  function mergeHistoryLists(serverList, localList) {
    const merged = new Map();
    const add = (item) => {
      if (!item || typeof item !== 'object') return;
      const key = historyItemKey(item);
      const prev = merged.get(key);
      merged.set(key, prev ? mergeHistoryItem(prev, item) : { ...item });
    };
    (Array.isArray(serverList) ? serverList : []).forEach(add);
    (Array.isArray(localList) ? localList : []).forEach(add);
    return [...merged.values()].sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 40);
  }

  function readImageBlobStore() {
    try {
      const raw = localStorage.getItem(IMAGE_BLOB_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  function writeImageBlobStore(store) {
    const keys = Object.keys(store || {})
      .map((k) => Number(k))
      .filter(Number.isFinite)
      .sort((a, b) => b - a)
      .slice(0, MAX_BLOBS);
    const trimmed = {};
    keys.forEach((ts) => {
      trimmed[ts] = store[ts];
    });
    try {
      localStorage.setItem(IMAGE_BLOB_KEY, JSON.stringify(trimmed));
      return true;
    } catch {
      return false;
    }
  }

  function persistImageBlob(ts, dataUrl, mimeType) {
    if (!dataUrl || !Number.isFinite(Number(ts))) return false;
    const store = readImageBlobStore();
    store[Number(ts)] = { dataUrl, mimeType: mimeType || '' };
    return writeImageBlobStore(store);
  }

  function hydrateHistoryItem(item) {
    if (!item || item.type !== 'image') return item;
    if (item.dataUrl) return item;
    const blob = readImageBlobStore()[Number(item.ts)];
    if (!blob?.dataUrl) return item;
    return { ...item, dataUrl: blob.dataUrl, mimeType: blob.mimeType || item.mimeType };
  }

  function hydrateHistoryList(list) {
    return (Array.isArray(list) ? list : []).map(hydrateHistoryItem);
  }

  /** Сохраняем dataUrl отдельно, в списке истории — только метаданные. */
  function prepareListForStorage(list) {
    return (Array.isArray(list) ? list : []).map((item) => {
      if (!item || item.type !== 'image' || !item.dataUrl) return item;
      persistImageBlob(item.ts, item.dataUrl, item.mimeType);
      const { dataUrl, ...rest } = item;
      return rest;
    });
  }

  global.VMHistory = {
    historyItemKey,
    mergeHistoryLists,
    persistImageBlob,
    hydrateHistoryItem,
    hydrateHistoryList,
    prepareListForStorage,
  };
})(typeof window !== 'undefined' ? window : globalThis);
