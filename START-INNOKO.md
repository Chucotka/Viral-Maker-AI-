# Запуск innoko.ru без VPN (3 действия от вас)

Автоматическая настройка VPS — `scripts/setup-vps-innoko.sh`.

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
git clone https://github.com/Chucotka/Viral-Maker-AI-.git /var/www/viral-maker
cd /var/www/viral-maker
cp .env.example .env
nano .env
bash scripts/setup-vps-innoko.sh
```

### 4. BotFather

- `/setdomain` → `app.innoko.ru`
- Menu Button → `https://app.innoko.ru/app/`

**`.env` на VPS:**

```env
WEBAPP_URL=https://app.innoko.ru/app
```

```bash
curl "https://api.telegram.org/bot<ТОКЕН>/setWebhook?url=https://innoko.ru/api/webhook"
```

---

## Проверка без VPN

| URL | Ожидание |
|-----|----------|
| `https://innoko.ru/` | Основной сайт компании (Manus) |
| `https://innoko.ru/app/` | Viral Maker AI |
| `https://app.innoko.ru/api/ping` | `pong` |
| `https://innoko.ru/go` | Редirect в студию |

См. [INNOKO-SITE.md](./INNOKO-SITE.md) — что **не** ломать при правках Manus.
