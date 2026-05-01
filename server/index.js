require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { setupBot } = require('./bot');

const generateRoute = require('./routes/generate');
const scoreRoute = require('./routes/score');
const trendsRoute = require('./routes/trends');
const publishRoute = require('./routes/publish');
const userRoute = require('./routes/user');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve static frontend files
app.use(express.static(path.join(__dirname, '../public')));

// API Routes
app.use('/api/generate', generateRoute);
app.use('/api/score', scoreRoute);
app.use('/api/trends', trendsRoute);
app.use('/api/publish', publishRoute);
app.use('/api/user', userRoute);

// Fallback to index.html for SPA
app.get(/^(?!\/api).+/, (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Initialize Telegram Bot
setupBot().catch(console.error);

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
