/**
 * Cache-Control для статики Viral Maker AI.
 */
function setStaticCacheHeaders(res, filePath) {
  const p = String(filePath || '');
  if (p.endsWith('.html')) {
    res.setHeader('Cache-Control', 'no-cache');
    return;
  }
  if (/\.(js|css|png|jpe?g|webp|gif|svg|ico|woff2?|map)$/i.test(p)) {
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
  }
}

module.exports = { setStaticCacheHeaders };
