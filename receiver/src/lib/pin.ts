type PinResult = 'set' | 'not-set' | 'error';
type VerifyResult = 'ok' | 'wrong' | 'error';

function apiUrl(host: string, path: string): string {
  if (!host) return path;
  return `http://${host}:8787${path}`;
}

export async function getPinStatus(serverHost: string): Promise<PinResult> {
  try {
    const res = await fetch(apiUrl(serverHost, '/api/pin/status'));
    const data = await res.json();
    return data.set ? 'set' : 'not-set';
  } catch {
    return 'error';
  }
}

export async function verifyPin(serverHost: string, pin: string): Promise<VerifyResult> {
  try {
    const res = await fetch(apiUrl(serverHost, '/api/pin/verify'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    });
    const data = await res.json();
    return data.ok ? 'ok' : 'wrong';
  } catch {
    return 'error';
  }
}
