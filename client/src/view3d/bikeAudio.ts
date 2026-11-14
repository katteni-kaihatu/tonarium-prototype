import { get, useStore } from '../store.ts';

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
  const levels = new Map<HTMLAudioElement, number>();
  const applyVolumes = () => {
    for (const [el, level] of levels) el.volume = get().audioMuted ? 0 : Math.max(0, Math.min(1, level * get().audioVol.fx));
  };
  const unsubscribe = useStore.subscribe((s, before) => {
    if (s.audioMuted !== before.audioMuted || s.audioVol.fx !== before.audioVol.fx) applyVolumes();
  });
  const level = (el: HTMLAudioElement, value: number) => { levels.set(el, value); applyVolumes(); };
  let rider: string | null | undefined;
  const loop = (el: HTMLAudioElement | null, volume: number, rate: number) => {
    if (!el) return;
    level(el, volume);
    el.playbackRate = rate;
    if (volume <= 0.001) { el.pause(); return; }
    if (el.paused) void el.play().catch(() => {});
  };
  return {
    update(nextRider: string | null, speed: number, slipping: boolean, distanceGain: number) {
      const gain = distanceGain;
      if (rider !== undefined && rider !== nextRider && mount) {
        mount.pause(); mount.currentTime = 0;
        level(mount, gain * 0.4);
        if (gain > 0.001) void mount.play().catch(() => {});
      }
      rider = nextRider;
      if (mount) { level(mount, gain * 0.4); if (!gain) mount.pause(); }
      loop(engine, nextRider && speed > 0.05 ? gain * (0.08 + speed * 0.018) : 0, 0.65 + speed * 0.1);
      loop(skid, nextRider && slipping ? gain * 0.25 : 0, 1);
    },
    dispose() { unsubscribe(); levels.clear(); [engine, skid, mount].forEach(el => { if (el) { el.pause(); el.removeAttribute('src'); el.load(); } }); },
  };
}
