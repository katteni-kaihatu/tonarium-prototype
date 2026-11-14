import { effectOutput, effectLevel } from '../effectOutput.ts';

type SurvivorSound = 'start' | 'attack' | 'level' | 'choice' | 'hit' | 'equip' | 'boss' | 'pause' | 'resume' | 'end' | 'victory';

let audio: AudioContext | null = null;
let lastAttackAt = 0;

function context() {
  if (typeof window === 'undefined' || !window.AudioContext) return null;
  try {
    if (!audio || audio.state === 'closed') audio = new AudioContext();
    if (audio.state === 'suspended') void audio.resume().catch(() => {});
    return audio;
  } catch { return null; }
}

export function unlockSurvivorAudio() {
  const c = context();
  if (c?.state === 'suspended') void c.resume().catch(() => {});
}

function tone(c: AudioContext, at: number, start: number, end: number, duration: number, wave: OscillatorType, volume: number) {
  const oscillator = c.createOscillator();
  const gain = c.createGain();
  oscillator.type = wave;
  oscillator.frequency.setValueAtTime(start, at);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, end), at + duration);
  gain.gain.setValueAtTime(Math.max(0.0001, volume), at);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  oscillator.connect(gain).connect(effectOutput(c));
  oscillator.start(at);
  oscillator.stop(at + duration + 0.02);
}

function hiss(c: AudioContext, at: number, duration: number, volume: number, cutoff: number) {
  const length = Math.max(1, Math.floor(c.sampleRate * duration));
  const buffer = c.createBuffer(1, length, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 2;
  const source = c.createBufferSource();
  const filter = c.createBiquadFilter();
  const gain = c.createGain();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(cutoff, at);
  gain.gain.setValueAtTime(volume, at);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  source.buffer = buffer;
  source.connect(filter).connect(gain).connect(effectOutput(c));
  source.start(at);
}

function chord(c: AudioContext, at: number, notes: number[], duration: number, volume: number) {
  notes.forEach((frequency, index) => tone(c, at + index * 0.075, frequency, frequency * 1.005, duration, 'sine', volume));
}

export function playSurvivorSound(kind: SurvivorSound, gear = '') {
  if (effectLevel() <= 0.001) return;
  if (kind === 'attack') {
    const now = performance.now();
    if (now - lastAttackAt < 90) return;
    lastAttackAt = now;
  }
  const c = context();
  if (!c) return;
  const at = c.currentTime + 0.012;
  const v = 1;

  switch (kind) {
    case 'attack':
      if (gear === 'starbolt' || gear === 'starfall') {
        tone(c, at, gear === 'starfall' ? 420 : 760, gear === 'starfall' ? 1180 : 1450, 0.16, 'sine', 0.075 * v);
        tone(c, at + 0.025, 380, 760, 0.12, 'triangle', 0.035 * v);
      } else if (gear === 'shade' || gear === 'umbralstorm') {
        tone(c, at, 310, 85, 0.18, 'triangle', 0.065 * v);
        hiss(c, at, 0.11, 0.035 * v, 900);
      } else if (gear === 'bloodaura' || gear === 'crimsonsun') {
        tone(c, at, 145, gear === 'crimsonsun' ? 690 : 470, 0.2, 'sawtooth', 0.045 * v);
        tone(c, at + 0.035, 520, 260, 0.15, 'sine', 0.035 * v);
      } else if (gear === 'eclipse') {
        chord(c, at, [440, 660, 990], 0.22, 0.045 * v);
        hiss(c, at, 0.12, 0.025 * v, 2400);
      } else {
        tone(c, at, 820, 210, 0.12, 'sawtooth', 0.055 * v);
        hiss(c, at, 0.08, 0.045 * v, 1800);
      }
      break;
    case 'start':
      tone(c, at, 180, 360, 0.42, 'sine', 0.12 * v);
      chord(c, at + 0.12, [392, 523, 784], 0.55, 0.055 * v);
      hiss(c, at, 0.25, 0.025 * v, 1200);
      break;
    case 'level':
      chord(c, at, [523, 659, 784, 1047], 0.52, 0.085 * v);
      tone(c, at + 0.08, 260, 520, 0.38, 'triangle', 0.055 * v);
      break;
    case 'choice':
      chord(c, at, [660, 880, 1175], 0.34, 0.095 * v);
      tone(c, at + 0.04, 440, 880, 0.3, 'triangle', 0.06 * v);
      break;
    case 'hit':
      tone(c, at, 190, 62, 0.22, 'sawtooth', 0.1 * v);
      hiss(c, at, 0.12, 0.055 * v, 650);
      break;
    case 'equip':
      tone(c, at, 440, 880, 0.14, 'triangle', 0.075 * v);
      tone(c, at + 0.09, 660, 990, 0.19, 'sine', 0.055 * v);
      break;
    case 'boss':
      tone(c, at, 92, 38, 0.9, 'sawtooth', 0.13 * v);
      tone(c, at + 0.18, 220, 55, 0.7, 'triangle', 0.09 * v);
      hiss(c, at, 0.62, 0.07 * v, 420);
      break;
    case 'pause':
      tone(c, at, 880, 330, 0.5, 'sine', 0.055 * v);
      tone(c, at + 0.06, 1320, 495, 0.45, 'triangle', 0.04 * v);
      break;
    case 'resume':
      tone(c, at, 220, 660, 0.25, 'triangle', 0.06 * v);
      chord(c, at + 0.08, [440, 660], 0.28, 0.045 * v);
      break;
    case 'end':
      tone(c, at, 440, 110, 0.8, 'sine', 0.08 * v);
      tone(c, at + 0.16, 330, 82, 0.78, 'triangle', 0.055 * v);
      break;
    case 'victory':
      chord(c, at, [392, 494, 587, 784], 0.72, 0.08 * v);
      tone(c, at + 0.22, 196, 392, 0.55, 'triangle', 0.075 * v);
      break;
  }
}
