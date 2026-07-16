#!/usr/bin/env bash
# Добавить app.viral-maker.ru в Let's Encrypt, если DNS уже указывает на VPS.
set -euo pipefail

APP_SUB="app.viral-maker.ru"
CERT_NAME="viral-maker.ru"
CERT_FILE="/etc/letsencrypt/live/${CERT_NAME}/fullchain.pem"

resolve_a() {
  local host="$1"
  if command -v dig >/dev/null 2>&1; then
    dig +short "$host" A @8.8.8.8 | head -1
    return
  fi
  getent ahostsv4 "$host" 2>/dev/null | awk '{print $1; exit}'
}

cert_has_app() {
  [[ -f "$CERT_FILE" ]] && openssl x509 -in "$CERT_FILE" -noout -text 2>/dev/null | grep -q "DNS:${APP_SUB}"
}

if ! resolve_a "$APP_SUB" | grep -qE '^[0-9.]+$'; then
  echo "    $APP_SUB нет в DNS — пропускаем расширение SSL"
  exit 0
fi

if ! certbot certificates 2>/dev/null | grep -q "Certificate Name: ${CERT_NAME}"; then
  echo "    Сертификат ${CERT_NAME} не найден — сначала bash scripts/setup-viral-maker-domain.sh"
  exit 0
fi

if cert_has_app; then
  echo "    OK: $APP_SUB уже в сертификате ${CERT_NAME}"
  exit 0
fi

echo "==> Расширяем SSL ${CERT_NAME} (+ $APP_SUB)"
certbot --nginx --expand \
  -d viral-maker.ru -d www.viral-maker.ru -d "$APP_SUB" \
  --non-interactive --agree-tos --register-unsafely-without-email

nginx -t
systemctl reload nginx

if cert_has_app; then
  echo "OK: сертификат обновлён для $APP_SUB"
else
  echo "!!! Сертификат не содержит $APP_SUB — проверьте certbot certificates"
  exit 1
fi
