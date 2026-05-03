const https = require('https');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  
  try {
    const { topic, platform = 'Telegram', tone = 'вирусный' } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) return res.status(500).json({ error: 'Missing GEMINI_API_KEY' });

    // Preparing the exact JSON structure Google expects
    const postData = JSON.stringify({
      contents: [{
        parts: [{
          text: `Ты эксперт по вирусному контенту для ${platform}. Тон: ${tone}. Создай вирусный пост на тему: ${topic}. Добавь 3-5 эмодзи. Закончи призывом к действию. Максимум 1000 символов.`
        }]
      }]
    });

    const options = {
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
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
      gReq.write(postData);
      gReq.end();
    });

    console.log("Response Status:", result.statusCode);

    if (result.statusCode === 200) {
      const parsed = JSON.parse(result.body);
      if (parsed.candidates && parsed.candidates[0] && parsed.candidates[0].content) {
        const text = parsed.candidates[0].content.parts[0].text;
        return res.json({
          content: text,
          model: "gemini-1.5-flash (raw)"
        });
      }
    }

    console.error("API Error Body:", result.body);
    res.status(result.statusCode).json({
      error: "Google API Error",
      status: result.statusCode,
      details: result.body
    });

  } catch (e) {
    console.error('SERVER ERROR:', e.message);
    res.status(500).json({ error: e.message });
  }
};