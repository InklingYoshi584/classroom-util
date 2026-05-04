export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? `{${key}}`);
}

export function buildCallMessage(name: string, template: string): string {
  const timestamp = Date.now();
  const timeStr = new Date(timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const message = renderTemplate(template, { name });

  return JSON.stringify({
    type: 'call-student',
    id: crypto.randomUUID?.() ?? `${timestamp}-${Math.random().toString(36).slice(2)}`,
    name,
    message,
    time: timeStr,
    timestamp,
  });
}

export function buildCustomMessage(text: string): string {
  const timestamp = Date.now();
  const timeStr = new Date(timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return JSON.stringify({
    type: 'call-student',
    id: crypto.randomUUID?.() ?? `${timestamp}-${Math.random().toString(36).slice(2)}`,
    name: '自定义',
    message: text,
    time: timeStr,
    timestamp,
  });
}
