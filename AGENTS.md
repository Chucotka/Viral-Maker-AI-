# AGENTS.md

## Cursor Cloud specific instructions

### Product

**Viral Maker AI** — Telegram Mini App (vanilla JS in `public/`, API in `api/`, local dev via Express in `server/`). Not a monorepo; single `package.json`, **npm** only.

### Standard commands

See `package.json` and `.github/workflows/ci.yml`:

| Task | Command |
|------|---------|
| Install | `npm ci` (or `npm install`) |
| Dev server | `npm run dev` → `http://127.0.0.1:3001` (or next free port if busy) |
| Unit tests | `npm test` |
| Server smoke | `node -e "require('./server/index.js'); require('./server/mountApi'); console.log('ok')"` |
| Lint | **None** configured (no ESLint/Prettier script) |

Copy env once: `cp .env.example .env` and fill secrets (see `SETUP.md`).

### Services (local dev)

| Service | Required for |
|---------|----------------|
| Node dev server (`npm run dev`) | Static UI + `/api/*` |
| Upstash Redis (`UPSTASH_*`) | User, quotas, generation, payments |
| `GEMINI_API_KEY` | Text/image generation |
| `TELEGRAM_BOT_TOKEN` + valid Mini App `initData` | Telegram Mini App auth |
| Guest web session | Browser at `/app/` (auto cookie, no Telegram) |
| HTTPS tunnel (ngrok) + `WEBAPP_URL` | Real Telegram Mini App E2E |

**Without secrets:** `/api/ping`, `/api/trends` (default trends), and static dashboard UI work. Generation and `/api/user` need Redis + Telegram.

### Dev server in background

Use tmux (not one-shot background):

```bash
SESSION_NAME="viral-maker-dev"
tmux -f /exec-daemon/tmux.portal.conf has-session -t "=$SESSION_NAME" 2>/dev/null \
  || tmux -f /exec-daemon/tmux.portal.conf new-session -d -s "$SESSION_NAME" -c /workspace -- bash -l
tmux -f /exec-daemon/tmux.portal.conf send-keys -t "$SESSION_NAME:0.0" 'cd /workspace && npm run dev' C-m
```

Health: `curl http://127.0.0.1:3001/api/ping` → `pong`.

### Gotchas

- Default port is **3001** (`PORT` in `.env`), not 3000.
- `nodemon` reloads on file changes; after `npm ci`, restart dev server if routes behave oddly.
- Opening `http://127.0.0.1:3001/app/` in a browser uses guest web session; generation needs Redis + `GEMINI_API_KEY`.
- Production: VPS at `app.innoko.ru` — deploy with `npm run deploy` (runs `scripts/deploy-vps.sh` on the server) or `bash scripts/deploy-vps.sh` on VPS after `git pull`.
- Optional integration smoke: `node scripts/payment-smoke.js` (needs deployed/tunneled `WEBAPP_URL`).
