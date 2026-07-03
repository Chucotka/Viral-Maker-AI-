const crypto = require('crypto');

const GUEST_PREFIX = 'web_';

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
  isGuestUserId,
  createGuestUserId,
  createGuestUser,
};
