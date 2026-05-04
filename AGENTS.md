# AGENTS.md — classroom-util

## Shell

**Windows 11 CMD.** PowerShell syntax (`if ($?)`, `Remove-Item`, `ls`) will fail. Use `&&` chaining (`tsc -b && vite build`).

## Architecture

Three independent packages (not a monorepo — no workspaces):

| Package | Role | Dev port | Deploy |
|---------|------|----------|--------|
| `server/` | Aedes MQTT broker + Express (serves sender dist in prod) | 8787 | `node index.js` |
| `sender/` | Vite+React SPA: student list, confirm send, PIN gate | 5173 | built to `dist/`, served by server |
| `receiver/` | Vite+React SPA: subscribe, display, TTS | 5174 | standalone dev or built independently |

Each package has its own `node_modules` and `package.json`. Root `package.json` is a convenience script runner (no deps).

## Commands

```bash
# First time or after pull
npm run install:all

# Dev — all three at once (uses concurrently)
npm run dev

# Or individually
cd server  && npm start
cd sender  && npm run dev
cd receiver && npm run dev

# Build for production
npm run build                    # builds sender + receiver
```

Each sender/receiver build runs `tsc -b` then `vite build` in that order.

## Vite proxy

Both `sender/vite.config.ts` and `receiver/vite.config.ts` proxy `/api` → `http://localhost:8787`. This is **required** in dev because API calls would otherwise 404 (API lives on port 8787, dev server on 5173/5174). In prod the server serves the sender on the same port so no proxy needed.

## Data flow

- **MQTT topics**: `classroom/{classId}` — sender publishes, receiver subscribes
- **Students**: stored on server via `GET /api/students?class=X` / `POST /api/students/set`, persisted to `server/data.json`. Shared across all senders.
- **PINs**: Set of strings, persisted to `server/data.json`. Verified via `POST /api/pin/verify`. Managed via sudo (`POST /api/pin/set`, `POST /api/pin/remove`, `POST /api/pin/list`). Sudo password hardcoded `Yoshi1024`.
- **Message template**: per-browser `localStorage` (not server). Editable only in Sudo mode (settings panel).
- **TTS settings**: per-browser `localStorage` in receiver.
- **`server/data.json`**: auto-created, in `.gitignore`. Restart-safe for PINs and students.

## MQTT quirks

- Aedes broker runs in-process (no separate service). WebSocket upgrade via `websocket-stream` on the same HTTP server.
- No retained messages — receiver must be subscribed before sender publishes.
- `mqtt.js` (v5) in the browser connects via WebSocket URL: `ws://{host}:8787`. Sender derives host from `window.location.hostname` (served by same server). Receiver has configurable server-host input (defaults to relative `/api` path via Vite proxy).

## Commit style

`feat:` prefix, short message. Example: `feat: persist PINs and students to server data.json`

## Key gotchas

- **Install at root does nothing.** Each package needs its own `npm install`.
- **Server must restart** after code changes (no hot reload for Node).
- **CORS** — server has wildcard `Access-Control-Allow-Origin: *`. Needed because receiver dev on port 5174 calls server on 8787.
- **TTS** — browser `SpeechSynthesis` requires user click to unlock on first use ("启用语音" button). Some browsers block auto-speak entirely.
- **Receiver server-host input** — leave blank for same-machine (Vite proxy handles it). Fill in LAN IP when receiver is on a different device.
