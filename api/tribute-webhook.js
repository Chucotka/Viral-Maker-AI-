const { handleTributeWebhook } = require('../lib/tributeWebhook');

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

module.exports = async (req, res) => {
  if (req.method === 'POST') {
    req.rawBody = await readRawBody(req);
    try {
      req.body = JSON.parse(req.rawBody.toString('utf8') || '{}');
    } catch {
      req.body = {};
    }
  }
  return handleTributeWebhook(req, res);
};

module.exports.config = {
  api: {
    bodyParser: false,
  },
};
