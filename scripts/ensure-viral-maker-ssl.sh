#!/usr/bin/env bash
# Добавить app.viral-maker.ru в Let's Encrypt, если DNS уже указывает на VPS.
set -euo pipefail

APP_SUB="app.viral-maker.ru"

if ! dig +short "$APP_SUB" A @8.8.8.8 | head -1 | grep -qE '^[0-9.]+$'; then
  echo "    $APP_SUB нет в DNS — пропускаем расширение SSL"
  exit 0
fi

if ! certbot certificates 2>/dev/null | grep -q 'Certificate Name: viral-maker.ru'; then
  echo "    Сертификат viral-maker.ru не найден — сначала bash scripts/setup-viral-maker-domain.sh"
  exit 0
fi

if certbot certificates 2>/dev/null | awk '/Certificate Name: viral-maker.ru/,/^$/' | grep -q "$APP_SUB"; then
  echo "    OK: $APP_SUB уже в сертификате viral-maker.ru"
  exit 0
fi

echo "==> Расширяем SSL viral-maker.ru (+ $APP_SUB)"
certbot certonly --nginx --expand \
  -d viral-maker.ru -d www.viral-maker.ru -d "$APP_SUB" \
  --non-interactive --agree-tos --register-unsafely-without-email

nginx -t
systemctl reload nginx
echo "OK: сертификат обновлён для $APP_SUB"
