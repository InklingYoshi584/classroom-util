export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? `{${key}}`);
}

export function previewTemplate(template: string): string {
  const vars: Record<string, string> = {
    name: '张三',
    message: '请张三同学到前台',
    time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
  };
  return renderTemplate(template, vars);
}
