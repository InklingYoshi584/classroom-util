import { pinyin } from 'pinyin-pro';

export function searchStudents(query: string, students: string[]): string[] {
  const q = query.toLowerCase().replace(/\s/g, '');
  if (!q) return students;

  return students.filter(name => {
    if (name.toLowerCase().includes(q)) return true;
    const full = pinyin(name, { toneType: 'none', type: 'array' }).join('').toLowerCase();
    if (full.includes(q)) return true;
    const initials = pinyin(name, { pattern: 'first', toneType: 'none', type: 'array' }).join('').toLowerCase();
    if (initials.includes(q)) return true;
    return false;
  });
}

export function toPinyin(name: string): string {
  return pinyin(name, { toneType: 'none' });
}
