const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../../posts.json');

// Initialize database if it doesn't exist
if (!fs.existsSync(DB_PATH)) {
  fs.writeFileSync(DB_PATH, JSON.stringify([]));
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

module.exports = { getPosts, savePost };
