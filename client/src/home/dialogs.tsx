import { t as tr } from '../i18n/index.ts';
import { contentAvailable, productFor } from '../../../shared/market.ts';
import { useOwnedContent } from '../market/store.ts';
import { OriginBadge } from '../market/OriginBadge.tsx';
import { useState } from 'react';
import { nameOf, useStore } from '../store.ts';
import type { Group, Visibility } from '../../../shared/protocol.ts';
import { VISIBILITY_INFO } from '../i18n/static.ts';
import { isGroupVisibility } from '../../../shared/protocol.ts';
import { GROUP_COLORS } from '../../../shared/home.ts';
import { WORLDS } from '../i18n/static.ts';
import { WORLD_KINDS, type WorldKind } from '../../../shared/worlds.ts';
import { createEvent, createGroup, createSession, invite, updateGroup } from '../actions.ts';
import { pickGroupImage } from '../icon.ts';
import { GroupAvatar } from './GroupAvatar.tsx';
import { Face } from '../world/common.tsx';
import { PersonName, useMyGroups, useOnlineFriends } from './common.tsx';

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="modalbg light" onClick={onClose}>
      <div className="modal hmodal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function GroupSettingsDialog({ group: g, onClose }: { group: Group; onClose: () => void }) {
  const selfId = useStore((s) => s.selfId);
  const [name, setName] = useState(g.name);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(false);
  const owner = g.owner === selfId;
  const editors = g.editors ?? [];
  const upload = async () => {
    setUploading(true);
    setError(false);
    const ok = await pickGroupImage(g.id);
    setUploading(false);
    setError(!ok);
  };
  return (
    <Modal title={tr("ui89")} onClose={onClose}>
      <label className="hfield">{tr("ui90")}<input autoFocus value={name} maxLength={40} onChange={(e) => setName(e.target.value)} /></label>
      <div className="hfield">{tr("ui91")}<div className="row"><GroupAvatar group={g} size="big" /><button disabled={uploading} onClick={upload}>{uploading ? tr("ui92") : tr("ui93")}</button></div>
        <span className="sub">{tr("ui94")}</span>
        {error && <span role="status">{tr("ui95")}</span>}
      </div>
      {owner && <div className="hfield">{tr("ui96")}<select aria-label={tr("ui97")} value="" onChange={(e) => { if (e.target.value) updateGroup(g.id, { editors: [...editors, e.target.value] }); }}>
          <option value="">{tr("ui98")}</option>
          {g.members.filter((n) => n !== g.owner && !editors.includes(n)).map((n) => <option key={n} value={n}>{nameOf(n)}</option>)}
        </select>
        {editors.map((n) => <div className="row" key={n}><span><PersonName id={n} /></span><button aria-label={tr("ui99", nameOf(n))} onClick={() => updateGroup(g.id, { editors: editors.filter((x) => x !== n) })}>×</button></div>)}
      </div>}
      <div className="row end"><button onClick={onClose}>{tr("ui73")}</button><button className="primary" disabled={!name.trim()} onClick={() => { updateGroup(g.id, { name }); onClose(); }}>{tr("ui100")}</button></div>
    </Modal>
  );
}

/** group を渡すと、そのグループのセッションとして作る */
export function CreateSessionDialog({ world: initial = 'room', group: fixedGroup, onClose }: { world?: WorldKind; group?: string; onClose: () => void }) {
  const myGroups = useMyGroups();
  const [name, setName] = useState('');
  const [topic, setTopic] = useState('');
  const owned = useOwnedContent();
  const [world, setWorld] = useState<WorldKind>(initial);
  const [visibility, setVisibility] = useState<Visibility>(fixedGroup ? 'group' : 'public');
  const [group, setGroup] = useState(fixedGroup ?? myGroups[0]?.id ?? '');
  const groupVis = isGroupVisibility(visibility);
  const ok = !!name.trim() && (!groupVis || !!group);
  const submit = () => {
    if (!ok) return;
    createSession(name, topic, world, visibility, groupVis ? group : undefined);
    onClose();
  };
  return (
    <Modal title={tr("ui101")} onClose={onClose}>
      <label className="hfield">{tr("ui102")}<input autoFocus value={name} maxLength={40} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} /></label>
      <label className="hfield">{tr("ui103")}<input value={topic} maxLength={100} placeholder={tr("ui104")} onChange={(e) => setTopic(e.target.value)} /></label>
      <div className="hfield">{tr("ui105")}<div className="hchoices">
          {WORLD_KINDS.filter((k) => contentAvailable(owned, 'worlds', k)).map((k) => (
            <div key={k} className="market-entry"><button className={`hchoice ${world === k ? 'on' : ''}`} onClick={() => setWorld(k)}><b>{WORLDS[k].name}</b><span className="sub wrap">{WORLDS[k].desc}</span></button><OriginBadge productId={productFor('worlds', k)?.id} onOpen={onClose} /></div>
          ))}
        </div>
      </div>
      <div className="hfield">{tr("ui106")}<div className="hchoices">
          {(Object.keys(VISIBILITY_INFO) as Visibility[]).map((v) => (
            <button key={v} className={`hchoice ${visibility === v ? 'on' : ''}`} disabled={isGroupVisibility(v) && !myGroups.length} onClick={() => setVisibility(v)}>
              <b>{VISIBILITY_INFO[v].name}</b><span className="sub wrap">{isGroupVisibility(v) && !myGroups.length ? tr("ui107") : VISIBILITY_INFO[v].desc}</span>
            </button>
          ))}
        </div>
      </div>
      {groupVis && !fixedGroup && (
        <label className="hfield">{tr("ui108")}<select value={group} onChange={(e) => setGroup(e.target.value)}>{myGroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select>
        </label>
      )}
      <div className="row end"><button onClick={onClose}>{tr("ui109")}</button><button className="primary" disabled={!ok} onClick={submit}>{tr("ui110")}</button></div>
    </Modal>
  );
}

export function CreateGroupDialog({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(GROUP_COLORS[0]);
  const submit = () => { if (name.trim()) { createGroup(name, color); onClose(); } };
  return (
    <Modal title={tr("ui111")} onClose={onClose}>
      <label className="hfield">{tr("ui90")}<input autoFocus value={name} maxLength={40} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} /></label>
      <div className="hfield">{tr("ui112")}<div className="row">
          {GROUP_COLORS.map((c) => <button key={c} className={`hcolor ${color === c ? 'on' : ''}`} style={{ background: c }} aria-label={c} onClick={() => setColor(c)} />)}
        </div>
      </div>
      <div className="row end"><button onClick={onClose}>{tr("ui109")}</button><button className="primary" disabled={!name.trim()} onClick={submit}>{tr("ui110")}</button></div>
    </Modal>
  );
}

/** datetime-local の値（ローカル時刻）。既定は次の 00 分 */
function defaultAt() {
  const d = new Date(Date.now() + 3_600_000);
  d.setMinutes(0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function CreateEventDialog({ onClose }: { onClose: () => void }) {
  const myGroups = useMyGroups();
  const sessions = useStore((s) => s.guild.sessions);
  const [title, setTitle] = useState('');
  const [at, setAt] = useState(defaultAt);
  const [group, setGroup] = useState('');
  const [session, setSession] = useState('');
  const ok = !!title.trim() && Number.isFinite(new Date(at).getTime());
  const submit = () => {
    if (!ok) return;
    createEvent(title, new Date(at).getTime(), group || null, session || null);
    onClose();
  };
  return (
    <Modal title={tr("ui113")} onClose={onClose}>
      <label className="hfield">{tr("ui114")}<input autoFocus value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} /></label>
      <label className="hfield">{tr("ui115")}<input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} /></label>
      <label className="hfield">{tr("ui116")}<select value={group} onChange={(e) => setGroup(e.target.value)}><option value="">{tr("ui64")}</option>{myGroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select>
      </label>
      <label className="hfield">{tr("ui117")}<select value={session} onChange={(e) => setSession(e.target.value)}><option value="">{tr("ui64")}</option>{sessions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
      </label>
      <div className="row end"><button onClick={onClose}>{tr("ui109")}</button><button className="primary" disabled={!ok} onClick={submit}>{tr("ui110")}</button></div>
    </Modal>
  );
}

/** フレンドを、自分に見えているセッションかグループに誘う */
export function InviteFriendDialog({ to, onClose }: { to: { id: string; name: string }; onClose: () => void }) {
  const sessions = useStore((s) => s.guild.sessions);
  const myGroups = useMyGroups();
  const pick = (kind: 'session' | 'group', id: string) => { invite(kind, id, to.id); onClose(); };
  return (
    <Modal title={tr("ui118", to.name)} onClose={onClose}>
      <h3>{tr("ui119")}</h3>
      <div className="hlist">
        {sessions.map((d) => <button key={d.id} className="ib hpick" onClick={() => pick('session', d.id)}><b>{d.name}</b><span className="sub">{d.topic}</span></button>)}
      </div>
      {myGroups.length > 0 && <>
        <h3>{tr("ui108")}</h3>
        <div className="hlist">
          {myGroups.filter((g) => !g.members.includes(to.id)).map((g) => <button key={g.id} className="ib hpick" onClick={() => pick('group', g.id)}><i className="gdot" style={{ background: g.color }} /><b>{g.name}</b></button>)}
        </div>
      </>}
      <div className="row end"><button onClick={onClose}>{tr("ui109")}</button></div>
    </Modal>
  );
}

/** グループにオンラインのフレンドを誘う */
export function InviteToGroupDialog({ group, onClose }: { group: Group; onClose: () => void }) {
  const friends = useOnlineFriends().filter((u) => !group.members.includes(u.id));
  return (
    <Modal title={tr("ui120", group.name)} onClose={onClose}>
      <div className="hlist">
        {friends.length === 0 && <p className="hempty">{tr("ui121")}</p>}
        {friends.map((u) => <button key={u.id} className="ib hpick" onClick={() => { invite('group', group.id, u.id); onClose(); }}><Face id={u.id} name={u.name} size={24} /><b>{u.name}</b></button>)}
      </div>
      <div className="row end"><button onClick={onClose}>{tr("ui109")}</button></div>
    </Modal>
  );
}
