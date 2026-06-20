# Gemini relay (Cloudflare Worker)

Google часто блокирует IP датацентров (Hetzner, Timeweb и др.) с ошибкой `User location is not supported`. Worker проксирует запросы из региона Cloudflare, доступного для Gemini API.

## 1. Установите Wrangler

```bash
npm install -g wrangler
wrangler login
```

## 2. Создайте секреты

```bash
cd scripts/cloudflare-gemini-relay
wrangler secret put GEMINI_API_KEY    # ваш ключ из Google AI Studio
wrangler secret put RELAY_SECRET      # длинная случайная строка (≥16 символов)
```

## 3. Деплой

```bash
wrangler deploy
```

URL будет вида: `https://viral-maker-gemini-relay.<account>.workers.dev`

## 4. На VPS в `.env`

```env
GEMINI_RELAY_URL=https://viral-maker-gemini-relay.<account>.workers.dev/ВАШ_RELAY_SECRET
GEMINI_RELAY_SECRET=ВАШ_RELAY_SECRET
GEMINI_API_KEY=любое-значение-или-реальный-ключ
```

`GEMINI_API_KEY` на VPS всё ещё нужен для кода, но реальный ключ хранится в Worker.

```bash
pm2 restart viral-maker
node scripts/gemini-image-smoke.js
```

## Альтернатива без Worker

1. Включить **биллинг** в [Google AI Studio](https://aistudio.google.com/) — иногда снимает гео-блок с VPS.
2. Задать HTTP-прокси в США/EU:

```env
GEMINI_HTTPS_PROXY=http://user:pass@proxy-host:port
```
