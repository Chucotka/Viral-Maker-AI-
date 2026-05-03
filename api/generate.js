const https = require('https');

module.exports = async (req, res) => {
  // We'll allow GET and POST for this diagnostic
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'Missing GEMINI_API_KEY' });

    console.log("Diagnostic: Fetching list of models...");

    const options = {
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models?key=${apiKey}`,
      method: 'GET'
    };

    const result = await new Promise((resolve, reject) => {
      const gReq = https.request(options, (gRes) => {
        let data = '';
        gRes.on('data', (chunk) => data += chunk);
        gRes.on('end', () => resolve({
          statusCode: gRes.statusCode,
          body: data
        }));
      });
      gReq.on('error', (e) => reject(e));
      gReq.end();
    });

    if (result.statusCode === 200) {
      const parsed = JSON.parse(result.body);
      // Return the full list of models to the user
      return res.json({
        success: true,
        message: "Here are the models available for your key",
        models: parsed.models ? parsed.models.map(m => m.name) : [],
        raw: parsed
      });
    }

    res.status(result.statusCode).json({
      success: false,
      error: "Could not list models",
      status: result.statusCode,
      body: result.body
    });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};