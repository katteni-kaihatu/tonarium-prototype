import { fxVolume } from '../volume.ts';
import type { EmoteId } from '../../../shared/emotes.ts';

let ctx: AudioContext | null = null;

/** Call on the dock gesture so browsers can unlock audio before the server echo. */
export function unlockEmoteAudio() {
  try { ctx ??= new AudioContext(); if (ctx.state === 'suspended') void ctx.resume().catch(() => {}); } catch { /* optional audio */ }
}

export function playChatNotification() {
  try {
    const volume = fxVolume() * 0.22;
    if (volume <= 0) return;
    if (!ctx || ctx.state !== 'running') return;
    tone(ctx, ctx.destination, ctx.currentTime, 880, 880, 0.12, 'sine', volume);
    tone(ctx, ctx.destination, ctx.currentTime + 0.1, 1174, 1174, 0.16, 'sine', volume * 0.7);
  } catch { /* 音声が使えなくても受信は続ける。 */ }
}

export function playEmoteSound(id: EmoteId, distanceVolume: number) {
  const volume = distanceVolume * fxVolume() * 0.22;
  if (volume <= 0.001) return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state !== 'running') return;
    const t = ctx.currentTime;
    const out = ctx.destination;
    if (id === 'cheer' || id === 'bow') {
      (id === 'cheer' ? [523, 659, 784, 1046] : [784, 659]).forEach((hz, i) => tone(ctx!, out, t + i * .16, hz, hz, .25, 'sine', volume));
    } else if (id === 'wave') {
      [660, 880, 1046].forEach((hz, i) => tone(ctx!, out, t + i * 0.13, hz, hz * 1.02, 0.2, 'sine', volume));
    } else if (id === 'hop') {
      for (let i = 0; i < 3; i++) tone(ctx, out, t + i * 0.33, 380 + i * 70, 850 + i * 100, 0.18, 'sine', volume);
    } else if (id === 'slump') {
      [620, 490, 370].forEach((hz, i) => tone(ctx!, out, t + i * 0.2, hz, hz * 0.8, 0.25, 'triangle', volume * 0.7));
    } else {
      tone(ctx, out, t, 520, 160, 0.45, 'sine', volume);
      tone(ctx, out, t + 0.45, 180, 65, 0.18, 'sine', volume);
      [1046, 1320, 1174].forEach((hz, i) => tone(ctx!, out, t + 0.65 + i * 0.12, hz, hz, 0.18, 'sine', volume * 0.55));
    }
  } catch { /* Reactions still work when audio is unavailable. */ }
}

function tone(c: AudioContext, out: AudioNode, t: number, f0: number, f1: number, dur: number, type: OscillatorType, vol: number) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + dur + 0.02);
  o.onended = () => { o.disconnect(); g.disconnect(); };
}

function noise(c: AudioContext, out: AudioNode, t: number, dur: number, vol: number) {
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
  const src = c.createBufferSource();
  const g = c.createGain();
  g.gain.value = vol;
  src.buffer = buf;
  src.connect(g).connect(out);
  src.start(t);
}

const SYNTH: Record<string, (c: AudioContext, out: AudioNode, t: number) => void> = {
  sparkle: (c, out, t) => [660, 880, 1108, 1320, 1760].forEach((hz, i) => tone(c, out, t + i * .12, hz, hz, .4, 'sine', .16)),
  fanfare: (c, out, t) => [523, 659, 784, 1046].forEach((hz, i) => tone(c, out, t + i * .18, hz, hz, .3, 'triangle', .2)),
  clap: (c, out, t) => { for (let i = 0; i < 8; i++) noise(c, out, t + i * 0.11 + Math.random() * 0.03, 0.06, 0.5); },
  laugh: (c, out, t) => { for (let i = 0; i < 4; i++) tone(c, out, t + i * 0.16, 420 - i * 30, 300 - i * 30, 0.12, 'sawtooth', 0.12); },
  wow: (c, out, t) => tone(c, out, t, 260, 520, 0.7, 'triangle', 0.25),
  drum: (c, out, t) => {
    tone(c, out, t, 140, 50, 0.25, 'sine', 0.6);
    noise(c, out, t + 0.25, 0.08, 0.4);
    tone(c, out, t + 0.45, 140, 50, 0.3, 'sine', 0.6);
    noise(c, out, t + 0.45, 0.35, 0.35);
  },
  bell: (c, out, t) => { tone(c, out, t, 880, 870, 0.6, 'sine', 0.25); tone(c, out, t + 0.3, 660, 650, 0.8, 'sine', 0.25); },
  boo: (c, out, t) => tone(c, out, t, 150, 110, 0.6, 'square', 0.12),
};

/** つんつんされたときの音（自分だけに鳴る） */
export function playPoke() {
  try {
    ctx ??= new AudioContext();
    const t = ctx.currentTime;
    const v = 0.3 * fxVolume();
    tone(ctx, ctx.destination, t, 700, 1100, 0.09, 'sine', v);
    tone(ctx, ctx.destination, t + 0.13, 800, 1300, 0.09, 'sine', v);
  } catch { /* 音が出せない環境では無視 */ }
}

export function playSynth(id: string, distanceVolume: number) {
  const f = SYNTH[id];
  const volume = distanceVolume * fxVolume();
  if (!f || volume <= 0.001) return;
  try {
    ctx ??= new AudioContext();
    const g = ctx.createGain();
    g.gain.value = volume;
    g.connect(ctx.destination);
    f(ctx, g, ctx.currentTime);
  } catch { /* 音が出せない環境では無視 */ }
}
