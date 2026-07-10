#!/usr/bin/env bash
# Обновление уже установленного Viral Maker AI на VPS.
# Запуск на сервере (root): bash scripts/deploy-vps-update.sh
# Или одной строкой:
#   curl -fsSL "https://raw.githubusercontent.com/Chucotka/Viral-Maker-AI-/cursor/studio-attachments-e202/scripts/deploy-vps-update.sh" | bash
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/viral-maker}"
BRANCH="${BRANCH:-cursor/viral-maker-domain-e202}"
REPO_URL="${REPO_URL:-https://github.com/Chucotka/Viral-Maker-AI-.git}"
PM2_NAME="${PM2_NAME:-viral-maker}"

echo "==> Viral Maker AI — обновление"
echo "    APP_DIR=$APP_DIR"
echo "    BRANCH=$BRANCH"

if [[ ! -d "$APP_DIR/.git" ]]; then
  echo "Репозиторий не найден. Первичная установка..."
  apt-get update -qq
  apt-get install -y -qq git nodejs npm nginx curl
  command -v pm2 >/dev/null 2>&1 || npm install -g pm2
  mkdir -p "$(dirname "$APP_DIR")"
  git clone "$REPO_URL" "$APP_DIR"
fi

cd "$APP_DIR"

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo ""
  echo "!!! Создан $APP_DIR/.env — заполните ключи и запустите скрипт снова."
  exit 1
fi

echo "==> git fetch + checkout $BRANCH"
git fetch origin
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"
export APP_BUILD="$(git rev-parse --short HEAD)"
if grep -q '^APP_BUILD=' .env 2>/dev/null; then
  sed -i "s/^APP_BUILD=.*/APP_BUILD=${APP_BUILD}/" .env
else
  echo "APP_BUILD=${APP_BUILD}" >> .env
fi

echo "==> npm ci"
npm ci --silent

if [[ -f scripts/apply-nginx-config.sh ]]; then
  echo "==> nginx"
  bash scripts/apply-nginx-config.sh
fi

echo "==> pm2"
if pm2 describe "$PM2_NAME" >/dev/null 2>&1; then
  pm2 restart "$PM2_NAME" --update-env
else
  pm2 start dev.js --name "$PM2_NAME"
  pm2 save
fi

sleep 2
PORT="$(grep -E '^PORT=' .env 2>/dev/null | cut -d= -f2- | tr -d '"' || echo 3001)"
PORT="${PORT:-3001}"

if curl -sf "http://127.0.0.1:${PORT}/api/ping" | grep -q pong; then
  echo ""
  echo "OK: http://127.0.0.1:${PORT}/api/ping → pong"
  curl -sf "http://127.0.0.1:${PORT}/api/health" | head -c 200 || true
  echo ""
  echo "==> stabilization smoke (local)"
  if node scripts/stabilization-smoke.js --local; then
    echo ""
    echo "Проверка снаружи: node scripts/stabilization-smoke.js"
    echo "              или: curl -s https://app.innoko.ru/api/health"
  else
    echo "!!! Smoke-check не прошёл — см. вывод выше"
    exit 1
  fi
else
  echo "!!! Приложение не отвечает на :${PORT}/api/ping"
  pm2 logs "$PM2_NAME" --lines 40 --nostream || true
  exit 1
fi

echo "==> health monitor (pm2 cron каждые 5 мин)"
pm2 delete vm-health 2>/dev/null || true
pm2 start scripts/health-monitor.js --name vm-health --no-autorestart --cron-restart="*/5 * * * *" || true
pm2 save 2>/dev/null || true
