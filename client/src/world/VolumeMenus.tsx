import { sourceText as uiSource } from '../i18n/core.ts';
import { localized, t as tr } from '../i18n/index.ts';
import { useStore } from '../store.ts';
import { peerLevel, setMasterVolume, setPeerVolume, togglePeerMute, type VolumeKind } from '../volume.ts';
import { Popover } from './common.tsx';
import { Icon } from './Icon.tsx';

const KINDS: { kind: VolumeKind; label: string }[] = localized([
  { kind: 'voice', label: uiSource('ui820') },
  { kind: 'fx', label: uiSource('ui821') },
  { kind: 'media', label: uiSource('ui822') },
]);

function Slider({ label, value, max, onChange }: { label: string; value: number; max: number; onChange: (v: number) => void }) {
  return (
    <label className="volrow">
      <span className="vollabel"><span>{label}</span><b>{Math.round(value * 100)}%</b></span>
      <input type="range" min={0} max={max} step={0.05} value={value} aria-label={label} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

/** ドックから開く全体の音量 */
export function MasterVolume({ anchor, onClose }: { anchor: DOMRect; onClose: () => void }) {
  const vol = useStore((s) => s.audioVol);
  return (
    <Popover anchor={anchor} side="up" onClose={onClose} className="volume">
      <span className="menutitle">{tr("ui37")}</span>
      {KINDS.map((k) => <Slider key={k.kind} label={k.label} value={vol[k.kind]} max={1} onChange={(v) => setMasterVolume(k.kind, v)} />)}
    </Popover>
  );
}

/** プレイヤーの行の右クリックで開く、その人の声の音量 */
export function PeerVolume({ id, name, anchor, onClose }: { id: string; name: string; anchor: DOMRect; onClose: () => void }) {
  const level = useStore((s) => peerLevel(id, s));
  const muted = useStore((s) => s.peerMuted.includes(id));
  return (
    <Popover anchor={anchor} onClose={onClose} className="volume">
      <span className="menutitle">{name} {tr("ui823")}</span>
      <Slider label={tr("ui824")} value={level} max={2} onChange={(v) => setPeerVolume(id, v)} />
      <div className="volbtns">
        <button className={`ib menuitem ${muted ? 'on' : ''}`} onClick={() => togglePeerMute(id)}>
          <Icon name={muted ? 'volumeOff' : 'volume'} />{muted ? tr("ui825") : tr("ui601")}
        </button>
        <button className="ib menuitem" disabled={level === 1} onClick={() => setPeerVolume(id, 1)}>{tr("ui826")}</button>
      </div>
    </Popover>
  );
}
