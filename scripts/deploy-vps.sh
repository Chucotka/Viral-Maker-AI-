#!/usr/bin/env bash
# Обновление на VPS (из /var/www/viral-maker):
#   bash scripts/deploy-vps.sh
set -euo pipefail

APP_DIR="${APP_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$APP_DIR"

echo "==> git pull"
git pull --ff-only

echo "==> npm ci"
npm ci --silent

echo "==> PM2 restart"
if command -v pm2 >/dev/null 2>&1; then
  pm2 restart viral-maker || pm2 start dev.js --name viral-maker
  pm2 save || true
else
  echo "WARN: pm2 не найден — запустите вручную: node dev.js"
fi

if [[ -d /etc/nginx/snippets ]] && [[ -f scripts/nginx-innoko-locations.conf ]]; then
  echo "==> nginx snippets"
  cp scripts/nginx-innoko-locations.conf /etc/nginx/snippets/innoko-locations.conf
  nginx -t
  systemctl reload nginx
fi

sleep 2
if curl -sf "http://127.0.0.1:${PORT:-3001}/api/ping" | grep -q pong; then
  echo "OK: /api/ping"
else
  echo "FAIL: приложение не отвечает на :${PORT:-3001}/api/ping"
  pm2 logs viral-maker --lines 30 --nostream 2>/dev/null || true
  exit 1
fi

echo "Готово: https://app.innoko.ru/app/"
