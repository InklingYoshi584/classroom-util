export interface TtsSettings {
  template: string;
  voiceName: string | null;
  rate: number;
  volume: number;
  repeat: number;
  enabled: boolean;
}

const DEFAULT_TEMPLATE = '{message}';

export const DEFAULT_TTS: TtsSettings = {
  template: DEFAULT_TEMPLATE,
  voiceName: null,
  rate: 1.0,
  volume: 1.0,
  repeat: 2,
  enabled: false,
};

const STORAGE_KEY = 'classroom-tts-settings';

export function loadTtsSettings(): TtsSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_TTS, ...parsed };
    }
  } catch {
    // ignore
  }
  return { ...DEFAULT_TTS };
}

export function saveTtsSettings(settings: TtsSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
