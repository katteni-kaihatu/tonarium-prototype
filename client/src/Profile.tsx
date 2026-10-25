import { msg, systemText, t as tr, type UiMessage } from './i18n/index.ts';
import { LanguageSelect } from './i18n/LanguageSelect.tsx';
import { PopupPauseSettings } from './world/NewArrivals.tsx';
import { useEffect, useState } from 'react';
import { iconUrl, pickIcon } from './icon.ts';
import { avatarTextureUrl, uploadAvatarImage, uploadAvatarManifest } from './avatar.ts';
import { send } from './net/ws.ts';
import { useStore } from './store.ts';
import { setLightweight, setLoadScale, setMapMode, setVoiceHeat } from './actions.ts';

const LOAD_SCALES = [0, 0.5, 1, 2, 3];

const OEKAKI_SITE = 'https://oekaki-avatar.anthrotech.dev/';

/** 名前ごとに保存されるアイコンと 3D アバターの設定 */
export function ProfileDialog({ name, onClose }: { name: string; onClose: () => void }) {
  const n = name.trim();
  const [icon, setIcon] = useState<string | null>(null);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [message, setMessage] = useState<string | UiMessage>('');
  const [bio, setBio] = useState('');
  const loadScale = useStore((s) => s.loadScale);
  const lightweight = useStore((s) => s.lightweight);
  const mapMode = useStore((s) => s.mapMode);
  const voiceHeat = useStore((s) => s.voiceHeat);
  useEffect(() => {
    let alive = true;
    void fetch(`/profile?name=${encodeURIComponent(n)}`).then((r) => r.json()).then((p: { bio: string }) => { if (alive) setBio(p.bio); });
    void fetch(iconUrl(n)).then((r) => { if (alive && r.ok) setIcon(iconUrl(n)); });
    void fetch(`/avatar?name=${encodeURIComponent(n)}&t=${Date.now()}`).then((r) => {
      if (alive && r.ok) setAvatar(String(Date.now()));
    });
    return () => { alive = false; };
  }, [n]);
  const saveBio = async () => {
    const r = await fetch(`/profile?name=${encodeURIComponent(n)}`, { method: 'POST', body: JSON.stringify({ bio }) });
    if (r.ok) send({ t: 'profileUpdated' });
    setMessage(r.ok ? msg("ui42") : msg("ui43"));
  };
  const run = async (f: () => Promise<string | null>, ok: (v: string) => void, label: UiMessage) => {
    const v = await f();
    if (v) { ok(v); setMessage(msg("ui44", label)); } else setMessage(msg("ui45", label));
  };

  return (
    <div className="modalbg" onClick={onClose}>
      <div className="modal profile" role="dialog" aria-modal="true" aria-label={tr('ui584', n)} onClick={(e) => e.stopPropagation()}>
        <h2>{tr('ui584', n)}</h2>
        <section><LanguageSelect /></section>
        <PopupPauseSettings />
        <div className="sub">{tr("ui47")}</div>
        <section>
          <h3>{tr("ui48")}</h3>
          <textarea className="biofield" value={bio} maxLength={300} onChange={(e) => setBio(e.target.value)} placeholder={tr("ui49")} aria-label={tr("ui48")} />
          <div className="row end"><button onClick={() => void saveBio()}>{tr("ui50")}</button></div>
        </section>
        <section>
          <h3>{tr("ui51")}</h3>
          <div className="row">
            {icon ? <img className="av big" src={icon} alt="" /> : <div className="av big noicon">{n.slice(0, 1)}</div>}
            <button onClick={() => void run(() => pickIcon(n), (v) => setIcon(iconUrl(n, v)), msg("ui52"))}>{tr("ui53")}</button>
          </div>
        </section>
        <section>
          <h3>{tr("ui54")}</h3>
          <img className="avatartex" src={avatarTextureUrl(n, avatar)} alt="" />
          {!avatar && <div className="sub">{tr("ui55")}</div>}
          <div className="row wrap">
            <button className="primary" onClick={() => void run(() => uploadAvatarImage(n), setAvatar, msg("ui56"))}>{tr("ui53")}</button>
            <button onClick={() => void run(() => uploadAvatarManifest(n), setAvatar, msg("ui57"))}>{tr("ui58")}</button>
            <a className="btnlink" href="/oekaki/template.png" download="oekaki-template.png">{tr("ui59")}</a>
            <a className="btnlink" href={OEKAKI_SITE} target="_blank" rel="noreferrer">{tr("ui60")}</a>
          </div>
          <div className="sub">{tr("ui61")}</div>
        </section>
        <section>
          <h3>{tr("ui62")}</h3>
          <div className="seg" role="radiogroup" aria-label={tr("ui63")}>
            {LOAD_SCALES.map((k) => (
              <button key={k} role="radio" aria-checked={loadScale === k} className={loadScale === k ? 'on' : 'ib'} onClick={() => setLoadScale(k)}>
                {k === 0 ? tr("ui64") : `×${k}`}
              </button>
            ))}
          </div>
          <div className="sub">{tr("ui65")}</div>
          <label className="checkrow">
            <input type="checkbox" checked={lightweight} onChange={(e) => setLightweight(e.target.checked)} />
            {tr("ui66")}</label>
        </section>
        <section>
          <h3>{tr("ui67")}</h3>
          <div className="seg" role="radiogroup" aria-label={tr("ui67")}>
            {(['none', '2d', '3d'] as const).map((k) => (
              <button key={k} role="radio" aria-checked={mapMode === k} className={mapMode === k ? 'on' : 'ib'} onClick={() => setMapMode(k)}>
                {k === 'none' ? tr("ui64") : k === '2d' ? tr("ui68") : tr("ui69")}
              </button>
            ))}
          </div>
          <div className="sub">{tr("ui70")}</div>
          <label className="checkrow">
            <input type="checkbox" checked={voiceHeat} onChange={(e) => setVoiceHeat(e.target.checked)} />
            {tr("ui71")}</label>
          <div className="sub">{tr("ui72")}</div>
        </section>
        {message && <div className="msgline" role="status">{systemText(message)}</div>}
        <div className="row end"><button onClick={onClose}>{tr("ui73")}</button></div>
      </div>
    </div>
  );
}
