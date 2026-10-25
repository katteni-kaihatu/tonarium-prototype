import type { AdFeedbackEvent } from './feedback.ts';

interface Note {
  hz: number;
  endHz?: number;
  delay?: number;
  duration?: number;
  level?: number;
  shape?: OscillatorType;
}

const MAX_VOICES = 24;
const MUSIC_URL = '/audio/ad-lab-reactor.ogg';
const MUSIC_LEVEL = 0.4;

/** Composed lab music with a bounded local instrument for operation feedback. */
export class AdSoundPlayer {
  private context: AudioContext | null = null;
  private output: GainNode | null = null;
  private voices = new Map<OscillatorNode, GainNode>();
  private musicBuffer: AudioBuffer | null = null;
  private musicLoad: Promise<void> | null = null;
  private musicAbort = new AbortController();
  private musicFailed = false;
  private musicSource: AudioBufferSourceNode | null = null;
  private musicGain: GainNode | null = null;
  private musicDistanceGain = 0;
  private musicOffset = 0;
  private musicStartedAt = 0;
  private volume = 1;
  private disposed = false;
  private resuming = false;
  private lastAction = new Map<string, number>();

  constructor(
    private createContext: () => AudioContext = () => new AudioContext(),
    private fetchTrack: typeof fetch = (input, init) => fetch(input, init),
  ) {}

  /** Only called from a user gesture, never from the production timer. */
  unlock = () => {
    if (this.disposed) return;
    try {
      if (!this.context) {
        this.context = this.createContext();
        this.output = this.context.createGain();
        this.output.gain.value = this.volume;
        this.output.connect(this.context.destination);
      }
      if (this.context.state === 'suspended' && !this.resuming) {
        this.resuming = true;
        void this.context.resume().then(() => this.syncMusic()).catch(() => this.stop()).finally(() => { this.resuming = false; });
      }
      this.syncMusic();
    } catch { /* Sound is optional when Web Audio is unavailable. */ }
  };

  setVolume(volume: number) {
    const next = Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 0;
    if (next === this.volume) return;
    this.volume = next;
    if (this.output && this.context) this.output.gain.setValueAtTime(this.volume, this.context.currentTime);
    if (this.volume === 0) this.stop();
  }

  play(event: AdFeedbackEvent) {
    if (!this.context || this.volume <= 0 || this.disposed) return;
    const key = `${event.kind}:${event.tier ?? ''}`;
    const now = this.context.currentTime;
    // Holding a key or buying a whole block cannot stack hundreds of voices.
    if (now - (this.lastAction.get(key) ?? -Infinity) < 0.055) return;
    this.lastAction.set(key, now);
    const tone = (hz: number, delay = 0, duration = 0.14, level = 0.11): Note => ({ hz, delay, duration, level });
    const chord = (notes: number[], spacing: number, duration = 0.22) => notes.map((hz, i) => tone(hz, i * spacing, duration));
    let notes: Note[];
    switch (event.kind) {
      case 'purchase': {
        const hz = 220 * 2 ** ((Math.max(1, Math.min(8, event.tier ?? 1)) - 1) / 7);
        notes = [tone(hz, 0, 0.11), tone(hz * ((event.count ?? 1) > 1 ? 2 : 1.5), 0.045, 0.16, 0.075)];
        break;
      }
      case 'tickspeed': notes = [{ hz: 500, endHz: 1050, duration: 0.15, level: 0.085 }, tone(1300, 0.08, 0.08, 0.05)]; break;
      case 'boost': notes = chord([196, 294, 392, 588], 0.065); break;
      case 'galaxy': notes = chord([146.83, 220, 293.66, 440, 587.33], 0.075, 0.3); break;
      case 'sacrifice': notes = [{ hz: 520, endHz: 130, duration: 0.23, level: 0.09 }, ...chord([440, 660], 0.14).map((n) => ({ ...n, delay: (n.delay ?? 0) + 0.25 }))]; break;
      case 'crunch': notes = [{ hz: 160, endHz: 55, duration: 0.28, level: 0.12 }, ...chord([261.63, 392, 523.25, 783.99], 0.075, 0.4).map((n) => ({ ...n, delay: (n.delay ?? 0) + 0.25 }))]; break;
      case 'save': notes = chord([523.25, 659.25], 0.075, 0.13); break;
      case 'load': notes = chord([659.25, 523.25, 783.99], 0.065, 0.13); break;
      case 'profile': notes = chord([392, 523.25, 659.25], 0.055, 0.15); break;
      case 'export': notes = chord([440, 660, 880], 0.055, 0.12); break;
      case 'import': notes = chord([880, 660, 440], 0.055, 0.12); break;
      case 'submit': notes = chord([523.25, 783.99, 1046.5], 0.07, 0.18); break;
      case 'error': notes = [{ hz: 185, endHz: 155, duration: 0.16, level: 0.07, shape: 'triangle' }, tone(155, 0.1, 0.14, 0.05)]; break;
      case 'navigate': notes = [tone(740, 0, 0.055, 0.04)]; break;
    }
    this.schedule(notes);
  }

  /** Keep a single decoded music loop while production is audible. */
  production(distanceGain: number) {
    const next = Number.isFinite(distanceGain) ? Math.max(0, Math.min(1, distanceGain)) : 0;
    if (next === 0) { this.stopProduction(); return; }
    if (this.disposed || this.volume <= 0) return;
    const changed = this.musicDistanceGain !== next;
    this.musicDistanceGain = next;
    if (changed && this.musicGain && this.context) {
      const now = this.context.currentTime;
      this.musicGain.gain.cancelScheduledValues(now);
      this.musicGain.gain.setValueAtTime(this.musicGain.gain.value, now);
      this.musicGain.gain.linearRampToValueAtTime(next * MUSIC_LEVEL, now + 0.2);
    }
    this.syncMusic();
  }

  private syncMusic() {
    const c = this.context;
    if (!c || c.state !== 'running' || !this.output || this.disposed || this.volume <= 0 || this.musicDistanceGain <= 0 || this.musicSource || this.musicFailed) return;
    if (!this.musicBuffer) {
      if (!this.musicLoad) {
        // Fetch and decode only once for this context. Late completions cannot start
        // playback after mute, leaving the lab, a hidden tab, or disposal.
        this.musicLoad = (async () => {
          try {
            const response = await this.fetchTrack(MUSIC_URL, { signal: this.musicAbort.signal });
            if (!response.ok) throw new Error(`Music request failed: ${response.status}`);
            const data = await response.arrayBuffer();
            if (this.disposed || c !== this.context) return;
            const buffer = await c.decodeAudioData(data);
            if (this.disposed || c !== this.context) return;
            this.musicBuffer = buffer;
            this.syncMusic();
          } catch {
            this.musicFailed = true;
            this.stopProduction();
          }
        })();
      }
      return;
    }
    try {
      const source = c.createBufferSource();
      const gain = c.createGain();
      this.musicSource = source;
      this.musicGain = gain;
      source.buffer = this.musicBuffer;
      source.loop = true;
      gain.gain.setValueAtTime(0, c.currentTime);
      gain.gain.linearRampToValueAtTime(this.musicDistanceGain * MUSIC_LEVEL, c.currentTime + 0.35);
      source.connect(gain).connect(this.output);
      this.musicStartedAt = c.currentTime;
      source.start(c.currentTime, this.musicOffset);
    } catch {
      this.musicFailed = true;
      this.stopProduction();
    }
  }

  private schedule(notes: Note[]) {
    const c = this.context;
    if (!c || !this.output || this.disposed || this.volume <= 0 || (c.state !== 'running' && !this.resuming)) return;
    try {
      for (const note of notes) {
        while (this.voices.size >= MAX_VOICES) this.stopVoice(this.voices.keys().next().value!);
        const oscillator = c.createOscillator();
        const gain = c.createGain();
        const start = c.currentTime + (note.delay ?? 0);
        const duration = note.duration ?? 0.15;
        oscillator.type = note.shape ?? 'sine';
        oscillator.frequency.setValueAtTime(note.hz, start);
        oscillator.frequency.exponentialRampToValueAtTime(note.endHz ?? note.hz, start + duration);
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(note.level ?? 0.1, start + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        oscillator.connect(gain).connect(this.output);
        this.voices.set(oscillator, gain);
        oscillator.onended = () => this.disconnectVoice(oscillator);
        oscillator.start(start);
        oscillator.stop(start + duration + 0.015);
      }
    } catch { this.stop(); }
  }

  private stopVoice(voice: OscillatorNode) {
    // Disconnect immediately, including notes scheduled to start in the future.
    this.disconnectVoice(voice);
    try { voice.stop(); } catch { /* A finished oscillator may already be stopped. */ }
  }

  private disconnectVoice(voice: OscillatorNode) {
    voice.onended = null;
    voice.disconnect();
    this.voices.get(voice)?.disconnect();
    this.voices.delete(voice);
  }

  stopProduction() {
    this.musicDistanceGain = 0;
    if (this.musicSource) {
      if (this.musicBuffer && this.context) {
        this.musicOffset = (this.musicOffset + this.context.currentTime - this.musicStartedAt) % this.musicBuffer.duration;
      }
      this.musicSource.disconnect();
      try { this.musicSource.stop(); } catch { /* A finished source may already be stopped. */ }
    }
    this.musicGain?.disconnect();
    this.musicSource = null;
    this.musicGain = null;
  }

  stop() {
    this.stopProduction();
    for (const voice of this.voices.keys()) this.stopVoice(voice);
    this.lastAction.clear();
  }

  dispose() {
    this.disposed = true;
    this.musicAbort.abort();
    this.stop();
    this.musicBuffer = null;
    this.output?.disconnect();
    if (this.context) void this.context.close().catch(() => {});
    this.output = null;
    this.context = null;
  }
}
