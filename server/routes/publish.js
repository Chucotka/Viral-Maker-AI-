const express = require('express');
const { getBot } = require('../bot');

const router = express.Router();

router.post('/', async (req, res) => {
    try {
        const { text, channel } = req.body;

        if (!text || !channel) {
            return res.status(400).json({ error: 'Text and channel are required' });
        }

        // Format channel string if necessary (ensure it starts with @)
        const channelId = channel.startsWith('@') ? channel : `@${channel}`;

        const bot = getBot();
        if (!bot) {
            return res.status(500).json({ error: 'Bot is not initialized. Check server configuration.' });
        }

        try {
            await bot.api.sendMessage(channelId, text);
            res.json({ success: true, message: 'Successfully published to channel' });
        } catch (botError) {
            console.error('Error sending message via bot:', botError);
            // Handle common permissions error gracefully
            if (botError.description && botError.description.includes('chat not found') || botError.description && botError.description.includes('bot is not a member')) {
                return res.status(403).json({ error: 'Добавь бота как администратора канала' });
            }
             return res.status(500).json({ error: 'Не удалось опубликовать. Проверьте права бота.' });
        }

    } catch (error) {
        console.error('Error in /api/publish:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;