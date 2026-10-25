import { t as tr } from '../i18n/index.ts';
import { useState } from 'react';
import { useStore } from '../store.ts';
import { STATUS_INFO } from '../i18n/static.ts';
import { STATUS_KINDS, STATUS_TEXT_MAX, type StatusKind } from '../../../shared/protocol.ts';
import { setStatus } from '../actions.ts';
import { Face } from '../world/common.tsx';
import { Icon } from '../world/Icon.tsx';

export interface StatusOf { online: boolean; status: StatusKind; text: string; lastSeen: number | null }

/** オンラインならユーザーから、オフラインなら届いている people から */
export function useStatusOf(name: string): StatusOf {
  const u = useStore((s) => s.users.find((x) => x.name === name));
  const p = useStore((s) => s.people[name]);
  if (u) return { online: true, status: u.status, text: u.statusText, lastSeen: null };
  return { online: false, status: p?.status ?? 'online', text: p?.statusText ?? '', lastSeen: p?.lastSeen ?? null };
}

export function ago(at: number) {
  const min = Math.max(1, Math.round((Date.now() - at) / 60_000));
  if (min < 60) return tr("ui328", min);
  const h = Math.round(min / 60);
  if (h < 24) return tr("ui329", h);
  return tr("ui330", Math.round(h / 24));
}

/** オンラインは「状態 · ひとこと」、オフラインはひとことだけ（VRChat と同じ） */
export function statusLine(st: StatusOf) {
  if (!st.online) return [st.text, st.lastSeen ? ago(st.lastSeen) : tr("ui130")].filter(Boolean).join(' · ');
  return [STATUS_INFO[st.status].name, st.text].filter(Boolean).join(' · ');
}

export function StatusDot({ st }: { st: StatusOf }) {
  return <i className="fdot" style={{ background: st.online ? STATUS_INFO[st.status].color : undefined }} />;
}

export function StatusText({ st, className = '' }: { st: StatusOf; className?: string }) {
  return <span className={`sub stline ${className}`} style={{ color: st.online ? STATUS_INFO[st.status].ink : undefined }}>{statusLine(st)}</span>;
}

export function StatusDialog({ onClose }: { onClose: () => void }) {
  const self = useStore((s) => s.users.find((u) => u.id === s.selfId));
  const selfName = useStore((s) => s.selfName);
  const selfId = useStore((s) => s.selfId);
  const recent = useStore((s) => s.recentStatus);
  const [kind, setKind] = useState<StatusKind>(self?.status ?? 'online');
  const [text, setText] = useState(self?.statusText ?? '');
  const preview: StatusOf = { online: true, status: kind, text: text.trim(), lastSeen: null };
  const submit = () => { setStatus(kind, text.trim()); onClose(); };
  return (
    <div className="modalbg light" onClick={onClose}>
      <div className="modal hmodal stdialog" role="dialog" aria-labelledby="st-title" onClick={(e) => e.stopPropagation()}>
        <div className="row">
          <h2 id="st-title">{tr("ui331")}</h2>
          <span className="sub">{tr("ui332")}</span>
          <span className="spacer" />
          <button className="ib" aria-label={tr("ui73")} onClick={onClose}><Icon name="close" size={16} /></button>
        </div>
        <fieldset className="stkinds">
          <legend className="hlabel">{tr("ui333")}</legend>
          {STATUS_KINDS.map((k) => (
            <label key={k} className={`stkind ${kind === k ? 'on' : ''}`} style={kind === k ? { borderColor: STATUS_INFO[k].color } : undefined}>
              <input type="radio" name="status" className="sr" checked={kind === k} onChange={() => setKind(k)} />
              <i className="stdot" style={{ background: STATUS_INFO[k].color }} />
              <span className="stdesc"><b>{STATUS_INFO[k].name}</b><span className="sub wrap">{STATUS_INFO[k].desc}</span></span>
            </label>
          ))}
        </fieldset>
        <label className="hfield">
          <span className="row">{tr("ui334")}<span className="spacer" /><span className="sub">{text.length} / {STATUS_TEXT_MAX}</span></span>
          <input value={text} maxLength={STATUS_TEXT_MAX} placeholder={tr("ui335")} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && submit()} />
        </label>
        {recent.length > 0 && (
          <div className="strecent">
            <span className="sub">{tr("ui336")}</span>
            {recent.map((r) => <button key={r} className="small" onClick={() => setText(r)}>{r}</button>)}
          </div>
        )}
        <div className="stpreview">
          <span className="sub">{tr("ui337")}</span>
          <div className="row">
            <span className="fface"><Face id={selfId} name={selfName} size={36} /><StatusDot st={preview} /></span>
            <span className="finfo"><b>{selfName}</b><StatusText st={preview} /></span>
          </div>
        </div>
        <div className="row end"><button onClick={onClose}>{tr("ui338")}</button><button className="primary" onClick={submit}>{tr("ui339")}</button></div>
      </div>
    </div>
  );
}
