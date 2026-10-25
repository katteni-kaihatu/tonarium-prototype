import { fxVolume } from '../volume.ts';

// 配布元を確認した素材だけをこのディレクトリに同梱する。
const files = import.meta.glob('/public/audio/bike/*.{wav,ogg,mp3}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const audio = (name: string, loop = false) => {
  const url = files[`/public/audio/bike/${name}`];
  if (!url) return null;
  const el = new Audio(url);
  el.loop = loop;
  return el;
};

export function createBikeAudio() {
  const engine = audio('engine.wav', true);
  const skid = audio('skid.wav', true);
  const mount = audio('mount.ogg');
  let rider: string | null | undefined;
  const loop = (el: HTMLAudioElement | null, volume: number, rate: number) => {
    if (!el) return;
    el.volume = Math.max(0, Math.min(1, volume));
    el.playbackRate = rate;
    if (volume <= 0.001) { el.pause(); return; }
    if (el.paused) void el.play().catch(() => {});
  };
  return {
    update(nextRider: string | null, speed: number, slipping: boolean, distanceGain: number) {
      const gain = fxVolume() * distanceGain;
      if (rider !== undefined && rider !== nextRider && mount) {
        mount.pause(); mount.currentTime = 0;
        mount.volume = Math.max(0, Math.min(1, gain * 0.4));
        if (mount.volume > 0.001) void mount.play().catch(() => {});
      }
      rider = nextRider;
      if (mount) { mount.volume = Math.max(0, Math.min(1, gain * 0.4)); if (!gain) mount.pause(); }
      loop(engine, nextRider && speed > 0.05 ? gain * (0.08 + speed * 0.018) : 0, 0.65 + speed * 0.1);
      loop(skid, nextRider && slipping ? gain * 0.25 : 0, 1);
    },
    dispose() { [engine, skid, mount].forEach(el => { if (el) { el.pause(); el.removeAttribute('src'); el.load(); } }); },
  };
}
