const crypto = require('crypto');

const GUEST_PREFIX = 'web_';

function isGuestUserId(userId) {
  return String(userId || '').startsWith(GUEST_PREFIX);
}

function createGuestUserId() {
  return `${GUEST_PREFIX}${crypto.randomUUID()}`;
}

function createGuestUser(userId = createGuestUserId()) {
  const id = String(userId);
  const short = id.replace(GUEST_PREFIX, '').slice(0, 6);
  return {
    id,
    first_name: 'Гость',
    guest_label: short,
    is_guest: true,
  };
}

module.exports = {
  GUEST_PREFIX,
  isGuestUserId,
  createGuestUserId,
  createGuestUser,
};
