const CLASS_KEY = 'classroom-sender-class';
const STUDENTS_KEY_PREFIX = 'classroom-students-';

export function loadClassId(): string {
  return localStorage.getItem(CLASS_KEY) || '';
}

export function saveClassId(id: string) {
  localStorage.setItem(CLASS_KEY, id);
}

export function loadStudents(classId: string): string[] {
  try {
    const raw = localStorage.getItem(`${STUDENTS_KEY_PREFIX}${classId}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveStudents(classId: string, students: string[]) {
  localStorage.setItem(`${STUDENTS_KEY_PREFIX}${classId}`, JSON.stringify(students));
}
