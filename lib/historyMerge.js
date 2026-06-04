/**
 * Merge server history (metadata only) with local cache (may include image dataUrl).
 */

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

module.exports = {
  historyItemKey,
  mergeHistoryItem,
  mergeHistoryLists,
};
