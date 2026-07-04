const crypto = require('crypto');

const GUEST_PREFIX = 'web_';
const GUEST_FREE_GENERATION_LIMIT = 3;

function guestFreeGenerationLimit() {
  const n = Number(process.env.GUEST_FREE_GENERATION_LIMIT);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : GUEST_FREE_GENERATION_LIMIT;
}

function isGuestUserId(userId) {
  return String(userId || '').startsWith(GUEST_PREFIX);
}

function createGuestUserId() {
  return `${GUEST_PREFIX}${crypto.randomUUID()}`;
}

function createGuestUser(userId = createGuestUserId()) {
  return {
    id: String(userId),
    first_name: '',
    is_guest: true,
  };
}

module.exports = {
  GUEST_PREFIX,
  GUEST_FREE_GENERATION_LIMIT,
  guestFreeGenerationLimit,
  isGuestUserId,
  createGuestUserId,
  createGuestUser,
};
