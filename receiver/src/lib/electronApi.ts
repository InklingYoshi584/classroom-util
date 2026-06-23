export interface ReceiverConfig {
  classId?: string;
  serverHost?: string;
}

interface ElectronHomeworkAPI {
  loadData: (classId: string) => Promise<Record<string, HomeworkDayData>>;
  saveData: (classId: string, data: Record<string, HomeworkDayData>) => Promise<{ ok: boolean; error?: string }>;
  exportBackup: (classId: string, data: Record<string, HomeworkDayData>) => Promise<{ ok: boolean; path?: string; error?: string }>;
  setAlwaysOnTop: (on: boolean) => Promise<void>;
  loadConfig: () => Promise<ReceiverConfig>;
  saveConfig: (config: ReceiverConfig) => Promise<{ ok: boolean; error?: string }>;
  openTimerWindow: () => Promise<{ ok: boolean }>;
  closeTimerWindow: () => Promise<{ ok: boolean }>;
  onTimerWindowClosed: (callback: () => void) => void;
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
  async setAlwaysOnTop(on: boolean) {
    if (window.electronAPI) {
      await window.electronAPI.setAlwaysOnTop(on);
    }
  },
  async loadConfig(): Promise<ReceiverConfig> {
    if (window.electronAPI) return window.electronAPI.loadConfig();
    return {
      serverHost: localStorage.getItem('classroom-receiver-server-host') || '',
      classId: localStorage.getItem('classroom-receiver-class') || '',
    };
  },
  async saveConfig(config: ReceiverConfig) {
    if (window.electronAPI) return window.electronAPI.saveConfig(config);
    if (config.serverHost !== undefined) localStorage.setItem('classroom-receiver-server-host', config.serverHost);
    if (config.classId !== undefined) localStorage.setItem('classroom-receiver-class', config.classId);
    return { ok: true };
  },
  async openTimerWindow() {
    if (window.electronAPI) return window.electronAPI.openTimerWindow();
    // Browser fallback: open as popup window
    window.open('/timer.html', 'classroom-timer', 'width=420,height=520');
    return { ok: true };
  },
  async closeTimerWindow() {
    if (window.electronAPI) return window.electronAPI.closeTimerWindow();
    return { ok: true };
  },
  onTimerWindowClosed(callback: () => void) {
    if (window.electronAPI) {
      window.electronAPI.onTimerWindowClosed(callback);
    }
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
