#!/usr/bin/env bash
# Проверка .env на VPS: bash scripts/verify-env.sh
set -euo pipefail

cd "$(dirname "$0")/.."
if [[ ! -f .env ]]; then
  echo "FAIL: нет файла .env"
  exit 1
fi
set -a
# shellcheck disable=SC1091
source .env
set +a

fail() { echo "FAIL: $1"; exit 1; }
ok() { echo "OK: $1"; }

[[ -n "${TELEGRAM_BOT_TOKEN:-}" ]] || fail "пустой TELEGRAM_BOT_TOKEN"
[[ -n "${GEMINI_API_KEY:-}" ]] || fail "пустой GEMINI_API_KEY"
[[ -n "${KV_REST_API_URL:-}${UPSTASH_REDIS_REST_URL:-}" ]] || fail "нет Redis URL"
[[ -n "${KV_REST_API_TOKEN:-}${UPSTASH_REDIS_REST_TOKEN:-}" ]] || fail "нет Redis TOKEN"
[[ -n "${SESSION_SECRET:-}${DEBUG_ADMIN_SECRET:-}" ]] || fail "нужен SESSION_SECRET или DEBUG_ADMIN_SECRET"

prefix="${TELEGRAM_BOT_TOKEN%%:*}"
bot_id="${TELEGRAM_BOT_ID:-$prefix}"
[[ "$bot_id" =~ ^[0-9]{8,12}$ ]] || fail "TELEGRAM_BOT_ID / префикс токена некорректен: '$bot_id'"

if [[ "$prefix" != "$bot_id" ]]; then
  echo "WARN: TELEGRAM_BOT_ID ($bot_id) != префикс токена ($prefix) — для OAuth используется TELEGRAM_BOT_ID"
fi

if [[ ${#prefix} -lt 9 && -z "${TELEGRAM_BOT_ID:-}" ]]; then
  fail "префикс токена слишком короткий ($prefix) — скопируйте TELEGRAM_BOT_TOKEN целиком или задайте TELEGRAM_BOT_ID"
fi

login_url="https://oauth.telegram.org/auth?bot_id=${bot_id}&origin=https%3A%2F%2Fapp.innoko.ru&request_access=write&return_to=https%3A%2F%2Fapp.innoko.ru%2Fapp%2F"
size=$(curl -sI "$login_url" | awk 'tolower($1) ~ /^content-length:/ {print $2}' | tr -d '\r')
if [[ -z "$size" || "$size" -lt 1000 ]]; then
  fail "OAuth Telegram не принимает bot_id=$bot_id (ответ слишком короткий). Исправьте TELEGRAM_BOT_TOKEN или TELEGRAM_BOT_ID"
fi
ok "OAuth bot_id=$bot_id"

curl -sf http://127.0.0.1:${PORT:-3001}/api/ping | grep -q pong && ok "local /api/ping" || fail "приложение не отвечает на :${PORT:-3001}"

echo ""
echo "Проверка пройдена. pm2 restart viral-maker --update-env"
