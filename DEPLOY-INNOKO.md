# Viral Maker AI на innoko.ru (полная веб-версия)

Приложение работает в **Telegram** и в **браузере** на `https://innoko.ru/app` с тем же аккаунтом (Telegram Login Widget + cookie-сессия).

## Архитектура

| URL | Назначение |
|-----|------------|
| `innoko.ru` | Лендинг Innoko (Manus) |
| `innoko.ru/app` | Полное приложение (UI + API на VPS) |
| `innoko.ru/api/*` | Backend (генерация, пользователь, оплата) |

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
WEBAPP_URL=https://innoko.ru/app
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

- **Menu Button:** `https://innoko.ru/app`
- **Webhook:** `https://innoko.ru/api/webhook`

```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://innoko.ru/api/webhook"
```

## 5. Manus

На лендинге добавьте в меню пункт **Viral Maker AI** → `https://innoko.ru/app` (не iframe — прямая ссылка).

## 6. Проверка

```bash
curl https://innoko.ru/api/ping
curl https://innoko.ru/api/trends
```

В браузере: `https://innoko.ru/app` → вход через Telegram → генерация поста.

## Локальная разработка веб-режима

```bash
cp .env.example .env
# SESSION_COOKIE_SECURE=false для http://127.0.0.1
npm run dev
```

Откройте `http://127.0.0.1:3001/app/` — появится виджет входа (домен localhost не пройдёт BotFather; для теста используйте ngrok с innoko.ru или тестируйте в Telegram).

## Ошибка при генерации изображения

На VPS:

```bash
cd /var/www/viral-maker   # или ваш путь к репозиторию
git pull
npm ci
node scripts/gemini-image-smoke.js   # прямой тест GEMINI_API_KEY
bash scripts/verify-env.sh           # полная проверка .env + Gemini
pm2 restart viral-maker
pm2 logs viral-maker --lines 80      # строка [generate-image] покажет причину
```

Частые причины: пустой `GEMINI_API_KEY`, ключ без доступа к image-моделям, не включён биллинг в Google AI Studio.

## Отвязка от Vercel

После проверки на `innoko.ru/app` удалите проект на Vercel (Settings → Danger Zone → Delete Project).
