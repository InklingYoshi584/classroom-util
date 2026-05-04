export async function getPinStatus(): Promise<boolean> {
  try {
    const res = await fetch('/api/pin/status');
    const data = await res.json();
    return data.set === true;
  } catch {
    return false;
  }
}

export async function verifyPin(pin: string): Promise<boolean> {
  try {
    const res = await fetch('/api/pin/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    });
    const data = await res.json();
    return data.ok === true;
  } catch {
    return false;
  }
}

export async function setPin(sudo: string, pin: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('/api/pin/set', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sudo, pin }),
    });
    return await res.json();
  } catch {
    return { ok: false, error: '网络错误' };
  }
}

export async function listPins(sudo: string): Promise<string[]> {
  try {
    const res = await fetch('/api/pin/list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sudo }),
    });
    const data = await res.json();
    return data.pins || [];
  } catch {
    return [];
  }
}

export async function removePin(sudo: string, pin: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('/api/pin/remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sudo, pin }),
    });
    return await res.json();
  } catch {
    return { ok: false, error: '网络错误' };
  }
}
