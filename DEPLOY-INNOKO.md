# Viral Maker AI на innoko.ru (полная веб-версия)

Приложение работает в **Telegram** и в **браузере** на `https://innoko.ru/#/dashboard` (как levsha.studio — hash-роутинг на том же домене).

## Архитектура

| URL | Назначение |
|-----|------------|
| `innoko.ru/#/dashboard` | Главная (дашборд) |
| `innoko.ru/#/studio` | Студия генерации |
| `innoko.ru/#/settings` | Настройки |
| `innoko.ru/landing` | Маркетинговый лендинг (Manus), опционально |
| `innoko.ru/api/*` | Backend (генерация, пользователь, оплата) |
| `innoko.ru/app` | Редirect → `/#/dashboard` (legacy) |

Manus **не** запускает API — нужен VPS с nginx.

## 1. BotFather

```
/setdomain
→ выберите бота
→ innoko.ru
```

Без этого Telegram Login Widget на сайте не заработает.

## 2. VPS: Node.js

```bash
git clone https://github.com/Chucotka/Viral-Maker-AI-.git /var/www/viral-maker
cd /var/www/viral-maker
npm ci
cp .env.example .env
```

Обязательные переменные:

```env
WEBAPP_URL=https://innoko.ru
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

`SESSION_SECRET` можно не задавать, если задан `DEBUG_ADMIN_SECRET`.

```bash
pm2 start dev.js --name viral-maker
pm2 save && pm2 startup
```

## 3. nginx на VPS

DNS в **1gb.ru**: запись **A** для `@` (innoko.ru) и `www` → IP VPS.

```nginx
server {
    listen 443 ssl http2;
    server_name innoko.ru www.innoko.ru;

    # ssl_certificate ... (certbot)

    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }

    location /app {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Лендинг Manus (URL проекта в Manus → Settings → Domains)
    location / {
        proxy_pass https://innokoai.manus.space;
        proxy_ssl_server_name on;
        proxy_set_header Host innokoai.manus.space;
        proxy_set_header X-Forwarded-Host $host;
    }
}
```

Если Manus отдаёт другой origin — замените `proxy_pass` на значение из панели Manus.

## 4. Telegram

- **Menu Button:** `https://innoko.ru/`
- **Webhook:** `https://innoko.ru/api/webhook`

```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://innoko.ru/api/webhook"
```

## 5. Manus

На лендинге Manus (`innoko.ru/landing`) добавьте ссылку **Viral Maker AI** → `https://innoko.ru/#/dashboard`

## 6. Проверка

```bash
curl https://innoko.ru/api/ping
curl https://innoko.ru/api/trends
```

В браузере: `https://innoko.ru/#/dashboard` → приложение открывается сразу на сайте.

## Локальная разработка веб-режима

```bash
cp .env.example .env
# SESSION_COOKIE_SECURE=false для http://127.0.0.1
npm run dev
```

Откройте `http://127.0.0.1:3001/#/dashboard` — hash-роутинг работает локально.

## Деплой (только VPS)

Продакшен — **Timeweb VPS** (`app.innoko.ru`), не Vercel.

```bash
cd /var/www/viral-maker
git pull
npm ci
pm2 restart viral-maker
```

Или с локальной машины через SSH:

```bash
ssh root@72.56.84.201 'cd /var/www/viral-maker && bash scripts/deploy-vps-update.sh'
```

Vercel больше не используется — удалите проект в [vercel.com](https://vercel.com) (Settings → Delete Project) и отзовите доступ в GitHub → Integrations.
