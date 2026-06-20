const crypto = require('crypto');

const DEFAULT_TTL_SEC = 30 * 24 * 60 * 60;

function sessionSecret() {
  return (
    String(process.env.SESSION_SECRET || '').trim() ||
    String(process.env.DEBUG_ADMIN_SECRET || '').trim() ||
    ''
  );
}

function b64urlEncode(buf) {
  return Buffer.from(buf).toString('base64url');
}

function b64urlDecode(str) {
  return Buffer.from(String(str), 'base64url');
}

function signSession(payload, ttlSec = DEFAULT_TTL_SEC) {
  const secret = sessionSecret();
  if (!secret) throw new Error('SESSION_SECRET or DEBUG_ADMIN_SECRET required for web sessions');
  const now = Math.floor(Date.now() / 1000);
  const body = {
    sub: String(payload.userId),
    user: payload.user || { id: Number(payload.userId) },
    startParam: payload.startParam ? String(payload.startParam) : null,
    iat: now,
    exp: now + ttlSec,
  };
  const encoded = b64urlEncode(JSON.stringify(body));
  const sig = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

function verifySession(token) {
  const secret = sessionSecret();
  if (!secret || !token || typeof token !== 'string') return null;
  const [encoded, sig] = token.split('.');
  if (!encoded || !sig) return null;
  const expected = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(b64urlDecode(encoded).toString('utf8'));
    const now = Math.floor(Date.now() / 1000);
    if (!payload?.sub || !payload?.exp || payload.exp < now) return null;
    return payload;
  } catch {
    return null;
  }
}

function parseCookieHeader(header) {
  const out = {};
  if (!header || typeof header !== 'string') return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(val);
  }
  return out;
}

function readSessionToken(req) {
  const cookies = parseCookieHeader(req.headers?.cookie || '');
  return cookies.vm_session || null;
}

function sessionCookieOptions() {
  const secure = process.env.SESSION_COOKIE_SECURE !== 'false';
  const maxAge = DEFAULT_TTL_SEC;
  const parts = [
    `Path=/`,
    `HttpOnly`,
    `SameSite=Lax`,
    `Max-Age=${maxAge}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

function setSessionCookie(res, token) {
  res.setHeader('Set-Cookie', `vm_session=${encodeURIComponent(token)}; ${sessionCookieOptions()}`);
}

function clearSessionCookie(res) {
  const secure = process.env.SESSION_COOKIE_SECURE !== 'false';
  const parts = ['Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (secure) parts.push('Secure');
  res.setHeader('Set-Cookie', `vm_session=; ${parts.join('; ')}`);
}

module.exports = {
  signSession,
  verifySession,
  readSessionToken,
  setSessionCookie,
  clearSessionCookie,
  parseCookieHeader,
};
