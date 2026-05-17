function normalizeTelegramChannel(input) {
  const raw = String(input || '').trim();
  if (!raw) return '';

  if (/^-?\d+$/.test(raw)) return raw;
  if (raw.startsWith('@')) return `@${raw.slice(1).trim().replace(/^@+/, '').toLowerCase()}`;

  const tmeMatch = raw.match(/^(?:https?:\/\/)?t\.me\/([^/?#]+)/i);
  if (tmeMatch) {
    const slug = String(tmeMatch[1] || '').trim().replace(/^@+/, '');
    return slug ? `@${slug.toLowerCase()}` : '';
  }

  const slug = raw.replace(/^@+/, '').trim();
  if (/^[A-Za-z0-9_]{4,}$/i.test(slug)) return `@${slug.toLowerCase()}`;

  return raw;
}

module.exports = { normalizeTelegramChannel };
