# viral-maker.ru — схема A (Manus + приложение на VPS)

Корень **`viral-maker.ru`** — маркетинговый лендинг **Manus** (webdev-проект).  
**`/app`** и **`/api`** — Node.js на том же VPS (как `innoko.ru` + Manus).

## Архитектура

| URL | Назначение |
|-----|------------|
| `https://viral-maker.ru/` | Лендинг Manus (hero, фичи, CTA) |
| `https://viral-maker.ru/app/landing.html` | Лендинг приложения (тарифы ₽, legal) |
| `https://viral-maker.ru/app/` | Telegram Mini App / веб-приложение |
| `https://viral-maker.ru/api/*` | Backend |
| `https://app.viral-maker.ru/` | → редирект на `/app/landing.html` |

`innoko.ru` и корпоративный Manus **не трогаем**.

---

## Шаг 1. Manus (webdev)

Ручная папка `/home/ubuntu/viral-maker-ai` **не публикуется** на домен. Нужен webdev-проект.

### Промпт для Manus

```
Создай webdev-проект viral-maker-ai из готового лендинга (checkpoint).

1. webdev_init_project — зарегистрируй проект в webdev-системе.
2. Custom domain: viral-maker.ru и www.viral-maker.ru
3. После публикации пришли Manus origin host (например viral-maker-ai.manus.space).

Все CTA «Открыть приложение» / «Запустить» веди на:
https://viral-maker.ru/app/landing.html

В футере обязательны ссылки:
- https://viral-maker.ru/app/legal/privacy.html
- https://viral-maker.ru/app/legal/terms.html
- https://viral-maker.ru/app/legal/offer.html

Тарифы на лендинге (в рублях):
- Free — 0 ₽
- Pro — 299 ₽ / 30 дн.
- Premium — 799 ₽ / 30 дн.
Оплата картой в рублях через Tribute.

Не веди сразу в /app/ без landing — сначала landing.html или согласие на Manus-странице.
```

Сохрани **hostname** из Manus (Settings → Domains), например `viral-maker-ai.manus.space`.

---

## Шаг 2. DNS (у регистратора)

| Тип | Имя | Значение |
|-----|-----|----------|
| A | `@` | `72.56.84.201` |
| A | `www` | `72.56.84.201` |
| A | `app` | `72.56.84.201` |

---

## Шаг 3. VPS

```bash
ssh root@72.56.84.201
cd /var/www/viral-maker
git pull
```

В `.env` добавь:

```env
MANUS_VIRAL_MAKER_HOST=viral-maker-ai.manus.space
WEBAPP_URL=https://viral-maker.ru/app
```

Запуск (один раз, после DNS):

```bash
bash scripts/setup-viral-maker-domain.sh
```

Скрипт: certbot SSL, nginx, `MANUS_VIRAL_MAKER_HOST` → прокси Manus на `/`, приложение на `/app` и `/api`.

Обновление без смены домена:

```bash
bash scripts/deploy-vps-update.sh
```

---

## Шаг 4. Telegram BotFather

```
/setdomain → viral-maker.ru
Menu Button → https://viral-maker.ru/
Webhook → https://viral-maker.ru/api/webhook
```

```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://viral-maker.ru/api/webhook"
```

---

## Проверка

```bash
curl -I https://viral-maker.ru/
curl https://viral-maker.ru/api/ping
curl -I https://app.viral-maker.ru/
curl -s https://viral-maker.ru/app/landing.html | head
```

- Корень — HTML Manus  
- `/api/ping` → `pong`  
- `app.viral-maker.ru` → редирект на landing  
- Product Radar URL: **`https://viral-maker.ru/app/landing.html`**

---

## Если Manus ещё не готов

В `.env` временно:

```env
MANUS_VIRAL_MAKER_HOST=innokoai.manus.space
```

Корень будет отдавать старый Manus до смены host после публикации webdev-проекта.
