export function parseStudentCsv(text: string): string[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return [];

  const first = lines[0].toLowerCase();
  const isHeader =
    first.includes('name') || first.includes('姓名') || first.includes('名字') || first.includes('学生');

  const start = isHeader ? 1 : 0;
  const names: string[] = [];

  for (let i = start; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const name = (cols[0] || '').trim();
    if (name) names.push(name);
  }

  return names;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        result.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
  }
  result.push(current);

  return result;
}
