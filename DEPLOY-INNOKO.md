# Viral Maker AI на innoko.ru

## Архитектура (актуальная)

| URL | Назначение |
|-----|------------|
| `innoko.ru/` | **Основной сайт Innoko** (корпоративный Manus: портфолио, услуги, контакты) |
| `innoko.ru/app/` | Viral Maker AI в браузере |
| `app.innoko.ru/app/` | То же приложение (домен Telegram BotFather) |
| `innoko.ru/go` | Короткая ссылка → студия с UTM |
| `innoko.ru/api/*` | Backend |
| `innoko.ru/landing` | Дублирует корень (legacy) |

Подробнее: [INNOKO-SITE.md](./INNOKO-SITE.md)

Manus **не** запускает API — нужен VPS с nginx и Node.

## 1. BotFather

```
/setdomain → app.innoko.ru
Menu Button → https://app.innoko.ru/app/
```

## 2. VPS: Node.js

```bash
git clone https://github.com/Chucotka/Viral-Maker-AI-.git /var/www/viral-maker
cd /var/www/viral-maker
npm ci
cp .env.example .env
```

Обязательные переменные:

```env
WEBAPP_URL=https://app.innoko.ru/app
TELEGRAM_BOT_TOKEN=...
TELEGRAM_BOT_USERNAME=ваш_бот
GEMINI_API_KEY=...
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
SESSION_SECRET=длинная_случайная_строка
OWNER_TELEGRAM_IDS=...
DEBUG_ADMIN_SECRET=...
PORT=3001
```

```bash
pm2 start dev.js --name viral-maker
pm2 save && pm2 startup
```

## 3. nginx

DNS: **A** для `@`, `www`, `app` → IP VPS.

Конфиг: `scripts/nginx-innoko-locations.conf` + `scripts/nginx-innoko.conf`.

Ключевое правило: **`location /` проксирует Manus** (основной сайт), **`location /app`** — Node-приложение.

```bash
bash scripts/setup-vps-innoko.sh   # первичная установка
bash scripts/deploy-vps-update.sh  # обновление
```

## 4. Telegram webhook

```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://innoko.ru/api/webhook"
```

## 5. Проверка

```bash
curl https://innoko.ru/api/ping          # pong
curl -sI https://innoko.ru/ | head -3   # основной сайт (не /app/)
curl https://app.innoko.ru/app/         # HTML приложения
node scripts/stabilization-smoke.js
```

## Локальная разработка

```bash
npm run dev
# http://127.0.0.1:3001/app/
```

Продакшен — **Timeweb VPS**, не Vercel.
