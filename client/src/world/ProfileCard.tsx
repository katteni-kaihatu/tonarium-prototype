import { t as tr, msg, systemText, type UiMessage } from '../i18n/index.ts';
import { GuestMark } from './GuestMark.tsx';
import { BotMark } from './BotMark.tsx';
import { useState } from 'react';
import { FollowButton } from '../home/common.tsx';
import { useStore, set, colorOf } from '../store.ts';
import { follow, goNear, poke, report, toggleBlock } from '../actions.ts';
import { useDistanceLabel } from '../spatial.ts';
import { Icon } from './Icon.tsx';
import { Face } from './common.tsx';

function ProfileDistance({ id }: { id: string }) {
  return <>{useDistanceLabel('user', id)}</>;
}

export function ProfileCard() {
  const id = useStore((s) => s.profileOf);
  const u = useStore((s) => s.participants.find((x) => x.id === s.profileOf));
  const me = useStore((s) => s.participants.find((p) => p.id === s.selfId));
  const friends = useStore((s) => s.friends);
  const blocked = useStore((s) => s.blocked);
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState('');
  const [done, setDone] = useState<string | UiMessage>('');
  if (!id || !u) return null;
  const close = () => { set({ profileOf: null }); setReporting(false); setDone(''); };
  const self = me?.id === u.id;
  const run = (f: () => void) => () => { f(); close(); };
  const canFollow = me?.mode === '2d' && u.mode === '3d' && !self;
  const following = me?.follow === u.id;
  const isFriend = friends.includes(u.id);
  const isBlocked = blocked.includes(u.id);
  const status = tr("ui665", u.mode === '3d' ? '3D' : '2D', u.sharing ? tr("ui666") : '', !u.micOn ? tr("ui667") : '', isFriend ? tr("ui668") : '');
  const sendReport = async () => {
    const ok = await report(u.id, reason);
    setDone(ok ? msg("ui669") : msg("ui670"));
    setReporting(false);
    setReason('');
  };

  return (
    <div className="modalbg" onClick={close}>
      <div role="dialog" aria-modal="true" aria-label={tr("ui584", u.name)} className="profilecard" onClick={(e) => e.stopPropagation()}>
        <div className="pcbanner" style={{ background: colorOf(u.id) }} />
        <button className="ib pcclose" onClick={close} aria-label={tr("ui73")}><Icon name="close" /></button>
        <div className="pcbody">
          <Face id={u.id} name={u.name} size={80} ring="0 0 0 4px #FFFDF9" />
          <div className="pcname">
            <h2>{u.name}<GuestMark guest={u.guest} /><BotMark bot={u.bot} /></h2>
            {u.username && <span className="sub">@{u.username}</span>}
            <span className="sub">{status} · <ProfileDistance id={u.id} /></span>
          </div>
          <p className="bio">{u.bio || tr("ui671")}</p>
          {!self && (
            <div className="pcacts">
              <button className="primary" onClick={run(() => goNear(u.id))}><Icon name="near" />{tr("ui611")}</button>
              <button onClick={run(() => follow(following ? null : u.id))} disabled={!canFollow} title={canFollow ? undefined : tr("ui672")}>
                <Icon name="follow" />{following ? tr("ui109") : tr("ui613")}
              </button>
              <button onClick={run(() => poke(u.id))}><Icon name="poke" />{tr("ui581")}</button>
            </div>
          )}
          {!self && (
            <div className="pcfoot">
              {/* ゲストはフォローできない（人に残るものを持たないため） */}
              {!u.guest && <FollowButton id={u.id} />}
              <span className="spacer" />
              <button className="ib" onClick={() => toggleBlock(u.id)}>{isBlocked ? tr("ui675") : tr("ui676")}</button>
              <button className="ib danger" onClick={() => setReporting(!reporting)}>{tr("ui677")}</button>
            </div>
          )}
          {isBlocked && <div className="sub">{tr("ui678")}</div>}
          {reporting && (
            <div className="reportbox">
              <label htmlFor="reportreason">{tr("ui679")}</label>
              <textarea id="reportreason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={tr("ui680")} />
              <button className="danger" onClick={() => void sendReport()}>{tr("ui681")}</button>
            </div>
          )}
          {done && <div className="sub ok">{systemText(done)}</div>}
        </div>
      </div>
    </div>
  );
}
