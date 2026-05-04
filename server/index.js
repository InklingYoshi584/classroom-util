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

// Serve sender SPA if built, otherwise show status page
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
