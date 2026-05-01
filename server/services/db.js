const fs = require('fs');
const path = require('path');

// Use /tmp for serverless read-only filesystem compatibility, fallback to local file otherwise
const isVercel = process.env.VERCEL || process.env.NODE_ENV === 'production';
const DB_PATH = isVercel ? '/tmp/posts.json' : path.join(__dirname, '../../posts.json');
const USERS_DB_PATH = isVercel ? '/tmp/users.json' : path.join(__dirname, '../../users.json');

// Initialize databases if they don't exist
try {
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify([]));
  }
} catch (error) {
  console.warn(`Failed to initialize ${DB_PATH}. Vercel read-only filesystem?`, error);
}

try {
  if (!fs.existsSync(USERS_DB_PATH)) {
    fs.writeFileSync(USERS_DB_PATH, JSON.stringify({}));
  }
} catch (error) {
  console.warn(`Failed to initialize ${USERS_DB_PATH}. Vercel read-only filesystem?`, error);
}

function getPosts() {
  try {
    const data = fs.readFileSync(DB_PATH, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading posts:', error);
    return [];
  }
}

function savePost(post) {
  try {
    const posts = getPosts();
    posts.unshift({
      id: Date.now().toString(),
      createdAt: new Date().toISOString(),
      ...post
    });

    // Optional: Keep only the latest 100 posts to avoid file getting too large
    if (posts.length > 100) {
      posts.length = 100;
    }

    fs.writeFileSync(DB_PATH, JSON.stringify(posts, null, 2));
    return posts[0];
  } catch (error) {
    console.error('Error saving post:', error);
    return null;
  }
}

// --- Users Logic ---

function getUsers() {
  try {
    const data = fs.readFileSync(USERS_DB_PATH, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading users:', error);
    return {};
  }
}

function saveUsers(users) {
  try {
    fs.writeFileSync(USERS_DB_PATH, JSON.stringify(users, null, 2));
  } catch (error) {
    console.error('Error saving users:', error);
  }
}

function getTodayString() {
  return new Date().toISOString().split('T')[0];
}

function resetIfNewDay(userId) {
  const users = getUsers();
  const today = getTodayString();

  if (!users[userId]) {
    return;
  }

  if (users[userId].lastResetDate !== today) {
    users[userId].dailyCount = 0;
    users[userId].lastResetDate = today;
    saveUsers(users);
  }
}

function getUserData(userId) {
  resetIfNewDay(userId); // ensure it's reset before reading if necessary
  const users = getUsers();

  if (!users[userId]) {
    users[userId] = {
      plan: 'free',
      dailyCount: 0,
      lastResetDate: getTodayString()
    };
    saveUsers(users);
  }

  return users[userId];
}

function incrementUserCount(userId) {
  const users = getUsers();
  if (users[userId]) {
    users[userId].dailyCount += 1;
    saveUsers(users);
  }
}

module.exports = { getPosts, savePost, getUserData, incrementUserCount, resetIfNewDay };
