#!/usr/bin/env bash
# Подключение viral-maker.ru к VPS (после DNS A → IP и webdev_init_project в Manus).
# Запуск на VPS (root): bash scripts/setup-viral-maker-domain.sh
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/viral-maker}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cd "$APP_DIR"

if [[ ! -f .env ]]; then
  echo "!!! Нет $APP_DIR/.env"
  exit 1
fi

echo "==> Проверка DNS (viral-maker.ru → этот сервер)"
PUBLIC_IP="$(curl -sf https://api.ipify.org || true)"
RESOLVED="$(getent ahostsv4 viral-maker.ru 2>/dev/null | awk '{print $1; exit}' || true)"
echo "    VPS IP: ${PUBLIC_IP:-unknown}"
echo "    viral-maker.ru A: ${RESOLVED:-не найден}"
if [[ -n "$PUBLIC_IP" && -n "$RESOLVED" && "$PUBLIC_IP" != "$RESOLVED" ]]; then
  echo "!!! DNS ещё не указывает на этот VPS. Настройте A-запись и повторите."
  exit 1
fi

if [[ -z "${MANUS_VIRAL_MAKER_HOST:-}" ]] && grep -q '^MANUS_VIRAL_MAKER_HOST=' .env 2>/dev/null; then
  MANUS_VIRAL_MAKER_HOST="$(grep '^MANUS_VIRAL_MAKER_HOST=' .env | cut -d= -f2- | tr -d '"' | tr -d "'")"
fi

if [[ -z "${MANUS_VIRAL_MAKER_HOST:-}" ]]; then
  DEFAULT_MANUS_HOST="viral-maker-ai.manus.space"
  if [[ -t 0 ]]; then
    read -r -p "Manus host (Enter = ${DEFAULT_MANUS_HOST}): " input_host
    MANUS_VIRAL_MAKER_HOST="${input_host:-$DEFAULT_MANUS_HOST}"
  else
    MANUS_VIRAL_MAKER_HOST="$DEFAULT_MANUS_HOST"
    echo "    MANUS_VIRAL_MAKER_HOST=${MANUS_VIRAL_MAKER_HOST} (default)"
  fi
  MANUS_VIRAL_MAKER_HOST="${MANUS_VIRAL_MAKER_HOST#https://}"
  MANUS_VIRAL_MAKER_HOST="${MANUS_VIRAL_MAKER_HOST%%/*}"
  if grep -q '^MANUS_VIRAL_MAKER_HOST=' .env; then
    sed -i "s|^MANUS_VIRAL_MAKER_HOST=.*|MANUS_VIRAL_MAKER_HOST=${MANUS_VIRAL_MAKER_HOST}|" .env
  else
    echo "MANUS_VIRAL_MAKER_HOST=${MANUS_VIRAL_MAKER_HOST}" >> .env
  fi
fi

echo "==> WEBAPP_URL для viral-maker.ru"
if ! grep -q '^WEBAPP_URL=https://viral-maker.ru' .env 2>/dev/null; then
  if grep -q '^WEBAPP_URL=' .env; then
    sed -i 's|^WEBAPP_URL=.*|WEBAPP_URL=https://viral-maker.ru/app|' .env
  else
    echo 'WEBAPP_URL=https://viral-maker.ru/app' >> .env
  fi
  echo "    WEBAPP_URL=https://viral-maker.ru/app"
fi

echo "==> SSL (certbot expand)"
if certbot certificates 2>/dev/null | grep -q 'viral-maker.ru'; then
  certbot renew --quiet || true
else
  certbot --nginx \
    -d viral-maker.ru -d www.viral-maker.ru -d app.viral-maker.ru \
    --non-interactive --agree-tos --register-unsafely-without-email \
    --expand 2>/dev/null \
    || certbot --nginx \
      -d viral-maker.ru -d www.viral-maker.ru -d app.viral-maker.ru \
      --non-interactive --agree-tos --register-unsafely-without-email
fi

echo "==> nginx viral-maker.ru"
cp "$SCRIPT_DIR/nginx-viral-maker.conf" /etc/nginx/sites-available/viral-maker.ru
ln -sf /etc/nginx/sites-available/viral-maker.ru /etc/nginx/sites-enabled/viral-maker.ru

bash "$SCRIPT_DIR/apply-nginx-config.sh"

pm2 restart viral-maker --update-env 2>/dev/null || true

echo ""
echo "============================================"
echo " Готово. Проверьте:"
echo "   curl -I https://viral-maker.ru/"
echo "   curl https://viral-maker.ru/api/ping"
echo "   curl -I https://app.viral-maker.ru/"
echo "   https://viral-maker.ru/app/landing.html"
echo ""
echo " BotFather: /setdomain → viral-maker.ru"
echo " Menu Button: https://viral-maker.ru/"
echo "============================================"
