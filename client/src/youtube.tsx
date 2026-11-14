import { useEffect, useRef } from 'react';
import { clockTime, type Item } from '../../shared/items.ts';
import { get, serverNow, useStore } from './store.ts';

type YouTubeItem = Item & { kind: 'youtube' };

interface YTPlayer {
  playVideo(): void; pauseVideo(): void; seekTo(s: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number; getDuration(): number; getPlayerState(): number;
  setVolume(v: number): void; mute(): void; unMute(): void; destroy(): void;
}
interface YTNamespace { Player: new (el: HTMLElement, opts: object) => YTPlayer; PlayerState: { PLAYING: number; BUFFERING: number } }

let api: Promise<YTNamespace> | null = null;
function loadApi(): Promise<YTNamespace> {
  const w = window as unknown as { YT?: YTNamespace & { loaded?: number }; onYouTubeIframeAPIReady?: () => void };
  api ??= new Promise((resolve) => {
    if (w.YT?.Player) { resolve(w.YT); return; }
    w.onYouTubeIframeAPIReady = () => resolve(w.YT!);
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(s);
  });
  return api;
}

/** 同じアイテムのプレーヤー（ウィンドウと 3D の重ね表示）から長さを取るため */
const players = new Map<string, Set<YTPlayer>>();
export function youTubeDuration(id: string) {
  for (const p of players.get(id) ?? []) {
    const d = p.getDuration?.();
    if (d) return d;
  }
  return NaN;
}

const DRIFT = 1.2;

/**
 * 再生はこちらの操作（MediaControls）だけで変える。YouTube 側の操作は受けないよう、
 * コントロールを出さず、プレーヤーの上は押せなくしてある
 */
export function YouTubePlayer({ item, volume }: { item: YouTubeItem; volume: () => number }) {
  const box = useRef<HTMLDivElement>(null);
  const volRef = useRef(volume);
  volRef.current = volume;
  useEffect(() => {
    let player: YTPlayer | null = null;
    let ready = false;
    let alive = true;
    let timer = 0;
    let appliedVolume: number | undefined;
    const applyVolume = () => {
      if (!ready || !player) return;
      const v = Math.round(Math.max(0, Math.min(1, volRef.current())) * 100);
      if (v === appliedVolume) return;
      appliedVolume = v;
      player.setVolume(v);
      if (v <= 0) player.mute(); else player.unMute();
    };
    const unsubscribe = useStore.subscribe(applyVolume);
    const host = document.createElement('div');
    box.current!.appendChild(host);
    void loadApi().then((YT) => {
      if (!alive) return;
      player = new YT.Player(host, {
        videoId: item.videoId,
        width: '100%', height: '100%',
        playerVars: { controls: 0, disablekb: 1, rel: 0, playsinline: 1, modestbranding: 1, iv_load_policy: 3, fs: 0 },
        events: {
          onReady: () => {
            ready = true;
            applyVolume();
            const set = players.get(item.id) ?? new Set();
            set.add(player!);
            players.set(item.id, set);
          },
        },
      });
      timer = window.setInterval(() => {
        const it = get().items[item.id];
        if (!player || !ready || it?.kind !== 'youtube') return;
        applyVolume();
        const target = clockTime(it.clock, serverNow());
        const dur = player.getDuration() || Infinity;
        const state = player.getPlayerState();
        const playing = state === YT.PlayerState.PLAYING || state === YT.PlayerState.BUFFERING;
        if (Math.abs(player.getCurrentTime() - Math.min(target, dur)) > DRIFT) player.seekTo(Math.min(target, dur), true);
        if (it.clock.playing && target < dur && !playing) player.playVideo();
        if (!it.clock.playing && playing) player.pauseVideo();
      }, 400);
    });
    return () => {
      alive = false;
      unsubscribe();
      clearInterval(timer);
      if (player) {
        players.get(item.id)?.delete(player);
        player.destroy();
      }
      host.remove();
    };
  }, [item.id, item.videoId]);
  return <div ref={box} className="ytbox" />;
}
