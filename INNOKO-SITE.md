# innoko.ru — сайт компании и продукт

## Принцип

**Основной сайт Innoko не заменяется приложением.** Viral Maker AI — один из продуктов на сайте, а не весь домен.

| URL | Что отдаёт | Редактирование |
|-----|------------|----------------|
| `https://innoko.ru/` | Корпоративный сайт (портфолио, услуги, контакты) | Manus → проект `innokoai` |
| `https://innoko.ru/app/` | Viral Maker AI (веб + Telegram Login) | этот репозиторий |
| `https://app.innoko.ru/app/` | То же приложение (домен BotFather) | этот репозиторий |
| `https://innoko.ru/api/*` | Backend | этот репозиторий |
| `https://innoko.ru/go` | Короткая ссылка → `/app/#/studio` | nginx |

## Чего не делать

- **Не** перегенерировать в Manus «лендинг только под приложение» вместо текущего корпоративного сайта.
- **Не** ставить Node-приложение на корень `/` — тогда пропадёт основной сайт.
- **Не** менять `proxy_pass` корня на что-то кроме Manus без явного решения владельца.

## Ссылки на продукт с основного сайта (Manus)

**Канонический URL приложения:** `https://app.innoko.ru/app/`

| Кнопка | URL |
|--------|-----|
| Открыть приложение / Подробнее | `https://app.innoko.ru/app/` |
| Запустить Viral Maker (hero) | `https://app.innoko.ru/app/#/studio` или `https://innoko.ru/go` |
| Открыть в Telegram | `https://t.me/viral_maker_ai_bot/app` |

`innoko.ru/go` — короткая ссылка с основного домена (редirect в студию с UTM).  
`innoko.ru/app/` — тоже работает, но для Manus и BotFather используйте **`app.innoko.ru/app/`**.

## BotFather

- **Domain:** `app.innoko.ru` (OAuth и Mini App)
- **Menu Button:** `https://app.innoko.ru/app/`

Корень `innoko.ru` остаётся сайтом компании; пользователь переходит в продукт по явной ссылке.

## Деплой nginx

После изменения `scripts/nginx-innoko-locations.conf`:

```bash
cp scripts/nginx-innoko-locations.conf /etc/nginx/snippets/innoko-locations.conf
nginx -t && systemctl reload nginx
```

Или полный цикл: `bash scripts/deploy-vps-update.sh`
