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

- **Agent commits after completing work.** After each turn that produces working changes, write a conventional commit message summarizing what changed and run `git add -A && git commit -m "..."`. Don't wait for the user to ask.
## Key gotchas

- **Install at root does nothing.** Each package needs its own `npm install`.
- **Server must restart** after code changes (no hot reload for Node).
- **CORS** — server has wildcard `Access-Control-Allow-Origin: *`. Needed because receiver dev on port 5174 calls server on 8787.
- **TTS** — browser `SpeechSynthesis` requires user click to unlock on first use ("启用语音" button). Some browsers block auto-speak entirely.
- **Receiver server-host input** — leave blank for same-machine (Vite proxy handles it). Fill in LAN IP when receiver is on a different device.

- **Missing `</style>` → blank page.** When editing inline `<style>` blocks in self-contained HTML files (e.g. `timer.html`), the closing `</style>` tag can be silently dropped. The browser treats everything from `<style>` to EOF as CSS, so the body is empty and nothing renders. Always verify `</style>` is present after CSS edits.
- **Double-interval from unguarded `startCountdown()`.** If `setInterval` is called while already running, a second interval is created overwriting the first ID — `clearInterval` only kills one, leaving an orphan that keeps counting. Always guard with `if (running) return;` at the top.
- **CSS Grid `height: 100%` unreliable in popup/Electron frameless windows.** Use flexbox instead: `body { display: flex; flex-direction: column; }` + `.main-content { flex: 1; }` for vertical centering. Grid with `1fr` can collapse to 0 when the viewport height isn't resolved.
- **Stale Vite dev processes.** Cancelling `npm run dev` (via concurrently) often leaves orphaned node processes holding ports. Run `dev.cmd` (project root) to kill all dev ports first, then start. Or manually:
  ```cmd
  netstat -ano | findstr "LISTENING" | findstr ":517[3-8] \|:8787 "
  taskkill /pid <PID> /f
  ```
- **`flex-shrink: 0` not enough to prevent text overflow in flex children.** When a flex container is too narrow, children with only `flex-shrink: 0` can still be squeezed below their text content width. Use `flex: none` + `min-width: max-content` on each child to force full text-based sizing.
