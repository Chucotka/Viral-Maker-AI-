const { handleTributeWebhook } = require('../lib/tributeWebhook');
const querystring = require('querystring');

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function parseBody(rawBody) {
  const text = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody || '');
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    const parsed = querystring.parse(text);
    if (parsed && Object.keys(parsed).length > 0) {
      return parsed;
    }
    return {};
  }
}

module.exports = async (req, res) => {
  if (req.method === 'POST') {
    req.rawBody = await readRawBody(req);
    req.body = parseBody(req.rawBody);
  }
  return handleTributeWebhook(req, res);
};

module.exports.config = {
  api: {
    bodyParser: false,
  },
};
