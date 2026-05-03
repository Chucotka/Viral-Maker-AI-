const https = require('https');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const { topic, platform = 'Telegram', tone = 'вирусный' } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    console.log("Raw Diagnostic starting...");

    // Directly calling the API via HTTPS to see raw response
    const data = JSON.stringify({
      contents: [{ parts: [{ text: `Напиши короткий пост для ${platform} на тему ${topic}` }] }]
    });

    const options = {
      hostname: 'generativelanguage.googleapis.com',
      port: 4443, // Standard for some Google APIs or just 443
      path: `/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    };

    // Try normal 443 first
    options.port = 443;

    const rawRequest = () => new Promise((resolve, reject) => {
      const request = https.request(options, (response) => {
        let body = '';
        response.on('data', (chunk) => body += chunk);
        response.on('end', () => resolve({
          statusCode: response.statusCode,
          headers: response.headers,
          body: body
        }));
      });
      request.on('error', (e) => reject(e));
      request.write(data);
      request.end();
    });

    const result = await rawRequest();
    console.log("Raw Response Status:", result.statusCode);
    console.log("Raw Response Body:", result.body);

    if (result.statusCode === 200) {
      const parsed = JSON.parse(result.body);
      const text = parsed.candidates[0].content.parts[0].text;
      return res.json({ content: text, raw: parsed });
    }

    res.status(result.statusCode).json({ 
      error: "Raw API call failed", 
      status: result.statusCode,
      body: result.body 
    });

  } catch(e) {
    console.error('DIAGNOSTIC ERROR:', e.message);
    res.status(500).json({ error: e.message });
  }
};