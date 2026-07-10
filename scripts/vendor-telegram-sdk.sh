#!/usr/bin/env bash
# Скачать актуальные SDK Telegram на свой домен (для работы Mini App с прокси).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
curl -sf "https://telegram.org/js/telegram-web-app.js" -o "$ROOT/public/js/telegram-web-app.js"
curl -sf "https://telegram.org/js/telegram-widget.js?22" -o "$ROOT/public/js/telegram-widget.js"
echo "OK: $(wc -c < "$ROOT/public/js/telegram-web-app.js") bytes web-app, $(wc -c < "$ROOT/public/js/telegram-widget.js") bytes widget"
