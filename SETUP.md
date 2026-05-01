# Viral Maker AI - Setup Instructions

Welcome to the **Viral Maker AI** setup guide! This project contains both the Express backend and the Vanilla JS frontend for the Telegram Mini App.

## Prerequisites
- Node.js installed on your machine
- ngrok installed on your machine (for local testing via HTTPS)
- A Telegram account to create a bot

## Step-by-Step Guide

### 1. Create a Telegram Bot
1. Open Telegram and search for `@BotFather`.
2. Send the `/newbot` command and follow the instructions to choose a name and username for your bot.
3. Once created, `@BotFather` will provide an HTTP API token. Copy this token.
4. Keep the BotFather chat open, you will need to add the bot as an administrator to the channel you wish to publish to later.

### 2. Configure Environment Variables
1. Copy the `.env.example` file and rename it to `.env`:
   ```bash
   cp .env.example .env
   ```
2. Open `.env` and fill in the values:
   - `OPENAI_API_KEY`: Your OpenAI API key.
   - `TELEGRAM_BOT_TOKEN`: The token you got from `@BotFather`.
   - `WEBAPP_URL`: Leave this blank for a moment, we will get it from ngrok.

### 3. Start ngrok
Telegram Mini Apps require an HTTPS URL. To expose your local development server to the internet via HTTPS, use ngrok.

Run the following command in your terminal to start ngrok on port 3000 (the default port for our app):
```bash
ngrok http 3000
```

Ngrok will display a public URL (e.g., `https://<random-string>.ngrok-free.app`).

1. Copy this HTTPS URL.
2. Open your `.env` file and paste it as the `WEBAPP_URL`.

### 4. Install Dependencies & Start the App
Now that your `.env` is fully configured, install the dependencies and start the app:

```bash
npm install
npm run dev
```

The server should now be running on `http://localhost:3000` and is accessible via your ngrok URL.

### 5. Set the Bot WebApp URL
You need to tell Telegram what URL to load when users open your Mini App.
There are a couple of ways to do this, but the easiest is using the BotFather:
1. Go back to `@BotFather` in Telegram.
2. Send the command `/mybots` and select your bot.
3. Go to **Bot Settings** -> **Menu Button** -> **Configure menu button**.
4. Send a URL (your ngrok HTTPS URL).
5. Give it a title (e.g., "Open App").

Alternatively, you can just start the bot. The provided code automatically sets a "Launch App" button in the `/start` command using your `WEBAPP_URL`.

### 6. Test Publishing to a Channel
To test the "Publish to channel" functionality:
1. Create a Telegram Channel (or use an existing one).
2. Add your bot as an **Administrator** to that channel with permission to "Post Messages".
3. In the app settings tab, configure the username of the channel (e.g., `@my_awesome_channel`).
4. Generate a post and click "Опубликовать в канал".

That's it! You should now have a fully functional local development environment for your Telegram Mini App.
