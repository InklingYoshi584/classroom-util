import { createRequire } from 'module';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import aedes from 'aedes';
import websocketStream from 'websocket-stream';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || '8787', 10);
const SENDER_DIR = path.join(__dirname, '..', 'sender', 'dist');

const require = createRequire(import.meta.url);
const os = require('os');

const app = express();
const broker = aedes();

// ── File persistence ──
const DATA_FILE = path.join(__dirname, 'data.json');

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('[DATA] Failed to load:', e.message);
  }
  return {};
}

function saveData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('[DATA] Failed to save:', e.message);
  }
}

function persist() {
  saveData({ pins: [...pinSet], students: studentsMap });
}

const persisted = loadData();
const pinSet = new Set(persisted.pins || []);
const studentsMap = persisted.students || {};

// ── JSON body parser (must come before routes) ──
app.use(express.json());

// ── CORS (receiver / frontend dev on different ports) ──
app.use((_req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (_req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ── PIN API routes ──
app.get('/api/pin/status', (_req, res) => {
  res.json({ set: pinSet.size > 0 });
});

app.post('/api/sudo/verify', (req, res) => {
  const { sudo } = req.body || {};
  res.json({ ok: sudo === 'Yoshi1024' });
});

app.post('/api/pin/verify', (req, res) => {
  const { pin } = req.body || {};
  if (pinSet.size === 0) return res.json({ ok: true });
  res.json({ ok: pinSet.has(pin) });
});

app.post('/api/pin/list', (req, res) => {
  const { sudo } = req.body || {};
  if (sudo !== 'Yoshi1024') {
    return res.status(403).json({ ok: false, error: 'Sudo 密码错误' });
  }
  res.json({ pins: [...pinSet] });
});

app.post('/api/pin/set', (req, res) => {
  const { sudo, pin } = req.body || {};
  if (sudo !== 'Yoshi1024') {
    return res.status(403).json({ ok: false, error: 'Sudo 密码错误' });
  }
  if (!pin || typeof pin !== 'string' || !pin.trim()) {
    return res.status(400).json({ ok: false, error: 'PIN 不能为空' });
  }
  const trimmed = pin.trim();
  if (pinSet.has(trimmed)) {
    return res.status(409).json({ ok: false, error: 'PIN 已存在' });
  }
  pinSet.add(trimmed);
  persist();
  console.log(`[PIN] added: ${trimmed} (total: ${pinSet.size})`);
  res.json({ ok: true });
});

app.post('/api/pin/remove', (req, res) => {
  const { sudo, pin } = req.body || {};
  if (sudo !== 'Yoshi1024') {
    return res.status(403).json({ ok: false, error: 'Sudo 密码错误' });
  }
  if (!pin || !pinSet.has(pin)) {
    return res.status(400).json({ ok: false, error: 'PIN 不存在' });
  }
  pinSet.delete(pin);
  persist();
  console.log(`[PIN] removed: ${pin} (total: ${pinSet.size})`);
  res.json({ ok: true });
});

// ── Students API ──
app.get('/api/students', (req, res) => {
  const cls = req.query.class || '';
  res.json({ students: studentsMap[cls] || [] });
});

app.post('/api/students/set', (req, res) => {
  const { class: cls, students } = req.body || {};
  if (!cls || !Array.isArray(students)) {
    return res.status(400).json({ ok: false, error: '参数错误' });
  }
  studentsMap[cls] = students;
  persist();
  console.log(`[DATA] students for ${cls}: ${students.length} names`);
  res.json({ ok: true });
});

// ── Serve sender SPA ──
const hasSender = fs.existsSync(SENDER_DIR);

if (hasSender) {
  app.use(express.static(SENDER_DIR));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(SENDER_DIR, 'index.html'));
  });
} else {
  app.get('*', (_req, res) => {
    res.type('html').send(`
      <!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><title>Classroom Server</title>
      <style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#111827;color:#e5e7eb}
      .card{background:#1f2937;border-radius:12px;padding:32px;max-width:420px;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,.3)}
      code{background:#374151;padding:2px 6px;border-radius:4px;font-size:.9em}
      .green{color:#10b981}</style></head><body>
      <div class="card"><h2>Server Running</h2><p class="green">MQTT WS on port ${PORT}</p>
      <p>Build the sender to enable the web UI:</p><p><code>cd sender && npm run build</code></p>
      <p>Then restart this server.</p></div></body></html>
    `);
  });
}

const httpServer = http.createServer(app);

// MQTT over WebSocket on same HTTP server
websocketStream.createServer({ server: httpServer }, broker.handle);

// MQTT logging
broker.on('client', (client) => {
  console.log(`[MQTT] client connected: ${client?.id}`);
});

broker.on('clientDisconnect', (client) => {
  console.log(`[MQTT] client disconnected: ${client?.id}`);
});

broker.on('publish', (packet, client) => {
  if (client) {
    const payload = packet.payload?.toString()?.slice(0, 100) || '';
    console.log(`[MQTT] ${packet.topic} <- ${payload}`);
  }
});

broker.on('subscribe', (subscriptions, client) => {
  const topics = subscriptions.map((s) => s.topic).join(', ');
  console.log(`[MQTT] ${client?.id} subscribed to: ${topics}`);
});

function getLanAddresses() {
  const nets = os.networkInterfaces();
  const results = [];
  for (const name of Object.keys(nets)) {
    const net = nets[name];
    if (!net) continue;
    for (const iface of net) {
      if (iface.family === 'IPv4' && !iface.internal) {
        results.push(iface.address);
      }
    }
  }
  return results;
}

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('========================================');
  console.log('  Classroom Server');
  console.log('========================================');
  console.log(`  MQTT WS:  ws://0.0.0.0:${PORT}`);
  if (hasSender) {
    console.log(`  Sender:   http://0.0.0.0:${PORT}`);
  }
  console.log('----------------------------------------');
  const interfaces = getLanAddresses();
  if (interfaces.length > 0) {
    console.log('  LAN Addresses:');
    for (const addr of interfaces) {
      console.log(`    http://${addr}:${PORT}`);
    }
    console.log('----------------------------------------');
  }
  if (!hasSender) {
    console.log('  (Sender not built yet — run: cd sender && npm run build)');
  }
  console.log('========================================');
  console.log('');
});
