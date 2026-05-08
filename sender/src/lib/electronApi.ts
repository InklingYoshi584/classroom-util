interface ElectronHomeworkAPI {
  loadData: (classId: string) => Promise<Record<string, HomeworkDayData>>;
  saveData: (classId: string, data: Record<string, HomeworkDayData>) => Promise<{ ok: boolean; error?: string }>;
  exportBackup: (classId: string, data: Record<string, HomeworkDayData>) => Promise<{ ok: boolean; path?: string; error?: string }>;
}

declare global {
  interface Window {
    electronAPI?: ElectronHomeworkAPI;
  }
}

const noop = async () => ({ ok: false, error: 'Not running in Electron' });

export const electronApi: ElectronHomeworkAPI = {
  async loadData(classId: string) {
    if (window.electronAPI) return window.electronAPI.loadData(classId);
    const raw = localStorage.getItem(`hw-${classId}`);
    return raw ? JSON.parse(raw) : {};
  },
  async saveData(classId: string, data: Record<string, HomeworkDayData>) {
    if (window.electronAPI) return window.electronAPI.saveData(classId, data);
    localStorage.setItem(`hw-${classId}`, JSON.stringify(data));
    return { ok: true };
  },
  async exportBackup(classId: string, data: Record<string, HomeworkDayData>) {
    if (window.electronAPI) return window.electronAPI.exportBackup(classId, data);
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `homework-${classId}-backup.json`;
    a.click();
    URL.revokeObjectURL(url);
    return { ok: true };
  },
};

export type HomeworkStatus = 'not-submitted' | 'submitted' | 'leave';

export interface HomeworkTask {
  id: number;
  name: string;
}

export interface HomeworkDayData {
  tasks: HomeworkTask[];
  taskStatuses: Record<string, Record<string, HomeworkStatus>>;
  todayTaskContent: string;
}
