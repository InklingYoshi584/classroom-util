export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? `{${key}}`);
}

export function buildCallMessage(name: string): string {
  const timestamp = Date.now();
  const timeStr = new Date(timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const message = `请 ${name} 同学到前台`;

  return JSON.stringify({
    type: 'call-student',
    id: crypto.randomUUID?.() ?? `${timestamp}-${Math.random().toString(36).slice(2)}`,
    name,
    message,
    time: timeStr,
    timestamp,
  });
}
