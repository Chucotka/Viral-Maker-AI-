#!/usr/bin/env bash
# Применить nginx-конфиги с VPS (innoko.ru + viral-maker.ru).
# MANUS_VIRAL_MAKER_HOST — hostname Manus после webdev_init_project (без https://).
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/viral-maker}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ -f "$APP_DIR/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$APP_DIR/.env"
  set +a
fi

MANUS_VIRAL_MAKER_HOST="${MANUS_VIRAL_MAKER_HOST:-viral-maker-ai.manus.space}"
MANUS_VIRAL_MAKER_HOST="${MANUS_VIRAL_MAKER_HOST#https://}"
MANUS_VIRAL_MAKER_HOST="${MANUS_VIRAL_MAKER_HOST%%/*}"

echo "==> nginx manus map (viral-maker.ru → ${MANUS_VIRAL_MAKER_HOST})"
mkdir -p /etc/nginx/conf.d /etc/nginx/snippets
sed "s/__VIRAL_MAKER_MANUS_HOST__/${MANUS_VIRAL_MAKER_HOST}/g" \
  "$SCRIPT_DIR/nginx-manus-map.conf" > /etc/nginx/conf.d/viral-maker-manus-map.conf

cp "$SCRIPT_DIR/nginx-innoko-locations.conf" /etc/nginx/snippets/innoko-locations.conf

if [[ -f /etc/nginx/sites-available/innoko.ru ]]; then
  cp "$SCRIPT_DIR/nginx-innoko.conf" /etc/nginx/sites-available/innoko.ru 2>/dev/null || true
fi

if [[ -L /etc/nginx/sites-enabled/viral-maker.ru ]]; then
  if certbot certificates 2>/dev/null | grep -q 'Certificate Name: viral-maker.ru'; then
    cp "$SCRIPT_DIR/nginx-viral-maker.conf" /etc/nginx/sites-available/viral-maker.ru
  elif [[ -f /etc/letsencrypt/live/viral-maker.ru/fullchain.pem ]]; then
    cp "$SCRIPT_DIR/nginx-viral-maker.conf" /etc/nginx/sites-available/viral-maker.ru
  fi
fi

nginx -t
systemctl reload nginx
echo "OK: nginx reloaded"
