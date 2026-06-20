# Запуск innoko.ru без VPN (3 действия от вас)

Автоматическая настройка VPS — скрипт `scripts/setup-vps-innoko.sh`.  
Агент **не может** войти в 1gb.ru, Timeweb и BotFather — это только вы.

---

## Вы делаете (≈10 мин)

### 1. DNS на 1gb.ru

| Тип | Имя | IP |
|-----|-----|-----|
| A | `@` | `72.56.84.201` |
| A | `www` | `72.56.84.201` |
| A | `app` | `72.56.84.201` |

Удалить CNAME `www` → manus, если есть.

### 2. Timeweb → Firewall

Открыть порты **80** и **443**.

### 3. SSH + скрипт

```bash
ssh root@72.56.84.201
```

```bash
git clone https://github.com/Chucotka/Viral-Maker-AI-.git /var/www/viral-maker
cd /var/www/viral-maker
git checkout cursor/web-auth-innoko-site-e202 2>/dev/null || git checkout main
cp .env.example .env
nano .env   # ключи (Gemini, Telegram, Upstash Redis)
bash scripts/setup-vps-innoko.sh
```

Скрипт сам: nginx, pm2, certbot (SSL).

### 4. BotFather

- `/setdomain` → `app.innoko.ru`
- Menu Button → `https://app.innoko.ru`

**`.env` на VPS — токен бота в кавычках** (иначе теряется первая цифра `8`):

```env
TELEGRAM_BOT_ID=8520170966
TELEGRAM_BOT_TOKEN="8520170966:полный_токен_из_BotFather"
```

```bash
curl "https://api.telegram.org/bot<ТОКЕН>/setWebhook?url=https://app.innoko.ru/api/webhook"
```

---

## Проверка без VPN

Телефон, VPN выключен:

- `https://innoko.ru`
- `https://app.innoko.ru/api/ping` → `pong`

---

## Если нужна помощь агента с сервером

Добавьте SSH-ключ на VPS (Timeweb → SSH keys) и пришлите **только** публичный ключ агента — без пароля root в чат.
