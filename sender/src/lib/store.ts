const CLASS_KEY = 'classroom-sender-class';
const STUDENTS_KEY_PREFIX = 'classroom-students-';
const MSG_TEMPLATE_KEY = 'classroom-sender-msg-template';

export const DEFAULT_MSG_TEMPLATE = '请 {name} 同学到前台';

export function loadClassId(): string {
  return localStorage.getItem(CLASS_KEY) || '';
}

export function saveClassId(id: string) {
  localStorage.setItem(CLASS_KEY, id);
}

export function loadMessageTemplate(): string {
  return localStorage.getItem(MSG_TEMPLATE_KEY) || DEFAULT_MSG_TEMPLATE;
}

export function saveMessageTemplate(template: string) {
  localStorage.setItem(MSG_TEMPLATE_KEY, template);
}

export async function loadStudents(classId: string): Promise<string[]> {
  try {
    const res = await fetch(`/api/students?class=${encodeURIComponent(classId)}`);
    const data = await res.json();
    return data.students || [];
  } catch {
    return [];
  }
}

export async function saveStudents(classId: string, students: string[]): Promise<boolean> {
  try {
    const res = await fetch('/api/students/set', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ class: classId, students }),
    });
    const data = await res.json();
    return data.ok === true;
  } catch {
    return false;
  }
}
