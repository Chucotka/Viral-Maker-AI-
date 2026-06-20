#!/usr/bin/env bash
# Запуск на VPS (root): bash scripts/setup-vps-innoko.sh
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/viral-maker}"
REPO_URL="${REPO_URL:-https://github.com/Chucotka/Viral-Maker-AI-.git}"
MANUS_ORIGIN="${MANUS_ORIGIN:-https://innokoai.manus.space}"

echo "==> Пакеты"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq nodejs npm nginx certbot python3-certbot-nginx git curl

if ! command -v pm2 >/dev/null 2>&1; then
  npm install -g pm2
fi

echo "==> Файрвол (ufw)"
if command -v ufw >/dev/null 2>&1; then
  ufw allow 22 || true
  ufw allow 80 || true
  ufw allow 443 || true
  ufw --force enable || true
fi

echo "==> Клонирование репозитория"
mkdir -p /var/www
if [[ ! -d "$APP_DIR/.git" ]]; then
  git clone "$REPO_URL" "$APP_DIR"
else
  cd "$APP_DIR"
  git pull --ff-only || true
fi
cd "$APP_DIR"

echo "==> .env"
if [[ ! -f .env ]]; then
  cp .env.example .env
  echo ""
  echo "!!! Создан $APP_DIR/.env — ЗАПОЛНИТЕ ключи и запустите скрипт снова:"
  echo "    nano $APP_DIR/.env"
  echo "    bash scripts/setup-vps-innoko.sh"
  exit 1
fi

# Проверка минимальных переменных
source_env() {
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
}
source_env

missing=()
[[ -z "${TELEGRAM_BOT_TOKEN:-}" ]] && missing+=("TELEGRAM_BOT_TOKEN")
[[ -z "${GEMINI_API_KEY:-}" ]] && missing+=("GEMINI_API_KEY")
redis_url="${UPSTASH_REDIS_REST_URL:-${KV_REST_API_URL:-}}"
redis_token="${UPSTASH_REDIS_REST_TOKEN:-${KV_REST_API_TOKEN:-}}"
[[ -z "$redis_url" ]] && missing+=("UPSTASH_REDIS_REST_URL или KV_REST_API_URL")
[[ -z "$redis_token" ]] && missing+=("UPSTASH_REDIS_REST_TOKEN или KV_REST_API_TOKEN")

if [[ ${#missing[@]} -gt 0 ]]; then
  echo "!!! Заполните в .env: ${missing[*]}"
  exit 1
fi

if [[ -z "${WEBAPP_URL:-}" ]]; then
  echo "WEBAPP_URL=https://app.innoko.ru" >> .env
fi
if [[ -z "${SESSION_SECRET:-}" && -n "${DEBUG_ADMIN_SECRET:-}" ]]; then
  echo "SESSION_SECRET=${DEBUG_ADMIN_SECRET}" >> .env
fi
if [[ -z "${PORT:-}" ]]; then
  echo "PORT=3001" >> .env
fi

echo "==> npm ci"
npm ci --silent

echo "==> PM2"
pm2 delete viral-maker 2>/dev/null || true
pm2 start dev.js --name viral-maker
pm2 save
pm2 startup systemd -u root --hp /root 2>/dev/null || pm2 startup

sleep 2
if ! curl -sf http://127.0.0.1:3001/api/ping | grep -q pong; then
  echo "!!! Приложение не отвечает на :3001/api/ping"
  pm2 logs viral-maker --lines 30 --nostream
  exit 1
fi
echo "OK: local /api/ping"

echo "==> nginx"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cp "$SCRIPT_DIR/nginx-innoko-locations.conf" /etc/nginx/snippets/innoko-locations.conf
cp "$SCRIPT_DIR/nginx-innoko-bootstrap.conf" /etc/nginx/sites-available/innoko.ru
ln -sf /etc/nginx/sites-available/innoko.ru /etc/nginx/sites-enabled/innoko.ru
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

echo "==> SSL (certbot)"
if certbot certificates 2>/dev/null | grep -q innoko.ru; then
  certbot renew --quiet || true
else
  certbot --nginx -d innoko.ru -d www.innoko.ru -d app.innoko.ru --non-interactive --agree-tos --register-unsafely-without-email
fi

echo "==> nginx (HTTPS + редирект HTTP→HTTPS)"
cp "$SCRIPT_DIR/nginx-innoko.conf" /etc/nginx/sites-available/innoko.ru
nginx -t
systemctl reload nginx

echo ""
echo "============================================"
echo " Готово. Проверьте:"
echo "   curl https://app.innoko.ru/api/ping"
echo "   curl https://innoko.ru"
echo "============================================"
