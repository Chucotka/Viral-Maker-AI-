const fs = require('fs');

const HISTORY_PATH = '/tmp/history.json';
const MAX_ITEMS = 50;

function sanitizeEntry(entry) {
  const o = { ...entry };
  delete o.imageBase64;
  delete o.dataUrl;
  return o;
}

function loadLocalHistoryMap() {
  try {
    const raw = fs.readFileSync(HISTORY_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveLocalHistoryMap(map) {
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(map));
}

async function appendLocalHistory(userId, entry) {
  const map = loadLocalHistoryMap();
  const key = String(userId);
  const list = Array.isArray(map[key]) ? map[key] : [];
  const ts = typeof entry.ts === 'number' ? entry.ts : Date.now();
  list.unshift(sanitizeEntry({ ...entry, ts }));
  map[key] = list.slice(0, MAX_ITEMS);
  saveLocalHistoryMap(map);
}

async function getLocalHistory(userId, limit = 40) {
  const map = loadLocalHistoryMap();
  const list = Array.isArray(map[String(userId)]) ? map[String(userId)] : [];
  return list.slice(0, limit);
}

module.exports = {
  HISTORY_PATH,
  MAX_ITEMS,
  appendLocalHistory,
  getLocalHistory,
  loadLocalHistoryMap,
  saveLocalHistoryMap,
};
