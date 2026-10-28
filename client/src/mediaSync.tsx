import { t as tr } from './i18n/index.ts';
import { useEffect, useState } from 'react';
import { clockTime, type Item } from '../../shared/items.ts';
import { useStore, get, set, serverNow } from './store.ts';
import { itemAction } from './items/actions.ts';
import { volumeAt } from './spatial.ts';
import { Icon } from './world/Icon.tsx';

type ClockItem = Item & { kind: 'youtube' };

const windowOpen = (id: string) => get().windows.some((w) => w.key === `item:${id}`);

const DEFAULT_VOLUME = 0.5;
export const userVolume = (id: string, s = get()) => s.volumes[id] ?? DEFAULT_VOLUME;
export const setUserVolume = (id: string, v: number) => set((s) => ({ volumes: { ...s.volumes, [id]: Math.max(0, Math.min(1, v)) } }));

/** 自分で決めた音量と全体の音量に、ウィンドウで見ているなら等倍、3D では距離で小さく、2D でウィンドウを閉じていれば無音を掛ける */
export function mediaVolume(item: Item) {
  const base = userVolume(item.id) * get().audioVol.media;
  if (windowOpen(item.id)) return base;
  return get().mode === '3d' ? base * volumeAt(item.x, item.z) : 0;
}

function VolumeControl({ id }: { id: string }) {
  const vol = useStore((s) => userVolume(id, s));
  const [before, setBefore] = useState(DEFAULT_VOLUME);
  const mute = () => {
    if (vol > 0) { setBefore(vol); setUserVolume(id, 0); } else setUserVolume(id, before || DEFAULT_VOLUME);
  };
  return (
    <span className="mvol">
      <button className="ib mbtn" onClick={mute} aria-label={vol > 0 ? tr("ui35") : tr("ui36")} title={tr("ui37")}>
        <Icon name={vol > 0 ? 'volume' : 'volumeOff'} size={16} />
      </button>
      <input type="range" min={0} max={1} step={0.05} value={vol} aria-label={tr("ui37")} onChange={(e) => setUserVolume(id, Number(e.target.value))} />
    </span>
  );
}

const fmt = (t: number) => {
  if (!Number.isFinite(t)) return '--:--';
  const s = Math.max(0, Math.floor(t));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** みんなで共有する再生ボタンとシークバー。押すと全員の再生がそろって変わる */
export function MediaControls({ item, duration }: { item: ClockItem; duration: () => number }) {
  const [, tick] = useState(0);
  const [seeking, setSeeking] = useState<number | null>(null);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 250);
    return () => clearInterval(t);
  }, []);
  const dur = duration();
  const now = Math.min(clockTime(item.clock, serverNow()), Number.isFinite(dur) ? dur : Infinity);
  const shown = seeking ?? now;
  // 最後まで再生し終わったら「止まっている」扱いにして、押すと最初から
  const ended = now >= dur - 0.2;
  const playing = item.clock.playing && !ended;
  const toggle = () => itemAction(item.id, { a: playing ? 'mediaPause' : 'mediaPlay', pos: ended ? 0 : now });
  const commit = () => {
    if (seeking !== null) itemAction(item.id, { a: 'mediaSeek', pos: seeking });
    setSeeking(null);
  };
  return (
    <div className="mediactl" onPointerDown={(e) => e.stopPropagation()}>
      <button className="ib mbtn" onClick={toggle} aria-label={playing ? tr("ui38") : tr("ui39")}>
        <Icon name={playing ? 'pause' : 'play'} size={16} />
      </button>
      <input
        type="range" min={0} max={Number.isFinite(dur) && dur > 0 ? dur : 1} step={0.1} value={Math.min(shown, Number.isFinite(dur) ? dur : shown)}
        aria-label={tr("ui40")} onChange={(e) => setSeeking(Number(e.target.value))} onPointerUp={commit} onKeyUp={commit}
      />
      <span className="mtime">{fmt(shown)} / {fmt(dur)}</span>
      <VolumeControl id={item.id} />
    </div>
  );
}
