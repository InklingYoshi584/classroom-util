import { TtsSettings } from './store';

export class TtsEngine {
  private synth = window.speechSynthesis;
  private queue: { text: string; settings: TtsSettings; resolve: () => void }[] = [];
  private busy = false;

  async speak(text: string, settings: TtsSettings): Promise<void> {
    if (!settings.enabled) return;
    return new Promise((resolve) => {
      this.queue.push({ text, settings, resolve });
      this.processQueue();
    });
  }

  cancel(): void {
    this.synth.cancel();
    this.queue = [];
    this.busy = false;
  }

  private async processQueue(): Promise<void> {
    if (this.busy) return;
    const task = this.queue.shift();
    if (!task) return;

    this.busy = true;
    this.synth.cancel();

    const { text, settings } = task;

    for (let i = 0; i < settings.repeat; i++) {
      try {
        await this.speakOnce(text, settings);
      } catch {
        break;
      }
      if (i < settings.repeat - 1) {
        await delay(600);
      }
    }

    this.busy = false;
    task.resolve();
    this.processQueue();
  }

  private speakOnce(text: string, settings: TtsSettings): Promise<void> {
    return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = settings.rate;
      utterance.volume = settings.volume;
      utterance.lang = 'zh-CN';

      if (settings.voiceName) {
        const voices = this.synth.getVoices();
        const voice = voices.find((v) => v.name === settings.voiceName);
        if (voice) utterance.voice = voice;
      }

      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();

      this.synth.speak(utterance);
    });
  }

  async getVoices(): Promise<SpeechSynthesisVoice[]> {
    return new Promise((resolve) => {
      const voices = this.synth.getVoices();
      if (voices.length > 0) {
        resolve(voices);
      } else {
        const handler = () => {
          resolve(this.synth.getVoices());
          this.synth.removeEventListener('voiceschanged', handler);
        };
        this.synth.addEventListener('voiceschanged', handler);
      }
    });
  }

  isAvailable(): boolean {
    return 'speechSynthesis' in window;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export const ttsEngine = new TtsEngine();
