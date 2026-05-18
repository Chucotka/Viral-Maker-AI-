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

function applyHistoryMutation(entry, mutation = {}) {
  const set = mutation && typeof mutation.set === 'object' ? mutation.set : {};
  const increments = mutation && typeof mutation.increments === 'object' ? mutation.increments : {};
  const next = { ...entry };
  for (const [key, value] of Object.entries(set)) {
    next[key] = value;
  }
  for (const [key, value] of Object.entries(increments)) {
    const delta = Number(value);
    if (!Number.isFinite(delta) || delta === 0) continue;
    const current = Number(next[key]) || 0;
    next[key] = current + delta;
  }
  return sanitizeEntry(next);
}

async function getLocalHistory(userId, limit = 40) {
  const map = loadLocalHistoryMap();
  const list = Array.isArray(map[String(userId)]) ? map[String(userId)] : [];
  return list.slice(0, limit);
}

async function updateLocalHistoryEntry(userId, ts, mutation = {}) {
  const map = loadLocalHistoryMap();
  const key = String(userId);
  const list = Array.isArray(map[key]) ? map[key] : [];
  const targetTs = Number(ts);
  if (!Number.isFinite(targetTs)) return null;
  const index = list.findIndex((item) => Number(item?.ts) === targetTs);
  if (index < 0) return null;
  const updated = applyHistoryMutation(list[index], mutation);
  list[index] = updated;
  map[key] = list;
  saveLocalHistoryMap(map);
  return updated;
}

module.exports = {
  HISTORY_PATH,
  MAX_ITEMS,
  appendLocalHistory,
  getLocalHistory,
  updateLocalHistoryEntry,
  loadLocalHistoryMap,
  saveLocalHistoryMap,
};
