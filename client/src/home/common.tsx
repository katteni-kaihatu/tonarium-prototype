import { sourceText as uiSource } from '../i18n/core.ts';
import { localized, t as tr } from '../i18n/index.ts';
import { get, nameOf, useStore } from '../store.ts';
import { RSVP_LABEL } from '../i18n/static.ts';
import { type EventDef, type Mode, type Rsvp, type User } from '../../../shared/protocol.ts';
import { answerEvent, followUser } from '../actions.ts';
import { Face } from '../world/common.tsx';
import { Icon } from '../world/Icon.tsx';

export const WEEKDAYS = localized([uiSource('ui75'), uiSource('ui76'), uiSource('ui77'), uiSource('ui78'), uiSource('ui79'), uiSource('ui80'), uiSource('ui81')]);

/** オンラインのフレンド（自分は除く） */
export function useOnlineFriends() {
  const users = useStore((s) => s.users);
  const friends = useStore((s) => s.friends);
  const selfId = useStore((s) => s.selfId);
  return users.filter((u) => u.id !== selfId && friends.includes(u.id));
}

export function useMyGroups() {
  const groups = useStore((s) => s.groups);
  const selfId = useStore((s) => s.selfId);
  return groups.filter((g) => g.members.includes(selfId));
}

export function ModeIcon({ mode, sharing }: { mode: Mode; sharing: boolean }) {
  if (sharing) return <span className="modeic live" title={tr("ui82")}><Icon name="screen" size={13} /></span>;
  return <span className="modeic" title={mode === '3d' ? '3D' : '2D'}><Icon name={mode === '3d' ? 'cube' : 'flat'} size={13} /></span>;
}

/** アカウント ID だけ分かっている人（オフラインかもしれない）の名前。名簿が変わったら引き直す */
export const usePersonName = (id: string) => useStore((s) => nameOf(id, s));

export function PersonName({ id }: { id: string }) {
  return <>{usePersonName(id)}</>;
}

/** アカウント ID だけ分かっている人（オフラインかもしれない）の顔 */
export function PersonFace({ id, size = 22 }: { id: string; size?: number }) {
  return <Face id={id} name={usePersonName(id)} size={size} />;
}

/** イベントの主催者。自分なら「あなた」と出す */
export function EventHost({ ev }: { ev: EventDef }) {
  const selfId = useStore((s) => s.selfId);
  const owner = usePersonName(ev.owner);
  return (
    <span className="evhost"><PersonFace id={ev.owner} size={18} /><span className="sub">{tr("ui83")}<b>{ev.owner === selfId ? tr("ui84") : owner}</b></span></span>
  );
}

export const match = (q: string, ...texts: (string | undefined)[]) => !q || texts.some((t) => t?.toLowerCase().includes(q.toLowerCase()));

/** フレンドのフォローを外すと DM も見えなくなるので、外す前に確かめる */
export function toggleFollow(id: string, on: boolean) {
  if (!on && get().friends.includes(id) && !confirm(tr('followUnfollowFriendConfirm', nameOf(id)))) return;
  followUser(id, on);
}

/** フォローのボタン。お互いにフォローするとフレンドになる */
export function FollowButton({ id }: { id: string }) {
  const following = useStore((s) => s.following.includes(id));
  const followsMe = useStore((s) => s.followers.includes(id));
  if (following) {
    return (
      <button className={followsMe ? 'on' : ''} aria-pressed title={tr('followUnfollowHint')} onClick={() => toggleFollow(id, false)}>
        <Icon name="check" size={14} />{followsMe ? tr('ui153') : tr('followFollowing')}
      </button>
    );
  }
  return <button className="primary" onClick={() => followUser(id, true)}>{followsMe ? tr('followBack') : tr('followFollow')}</button>;
}

export function Chip({ kind, children }: { kind: string; children: React.ReactNode }) {
  return <span className={`hchip ${kind}`}>{children}</span>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="hempty">{children}</p>;
}

export function timeLabel(at: number) {
  const d = new Date(at);
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const day = 86_400_000;
  const hm = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (at >= start && at < start + day) return tr("ui85", hm);
  if (at >= start + day && at < start + day * 2) return tr("ui86", hm);
  if (at >= start - day && at < start) return tr("ui87", hm);
  if (at >= start && at < start + day * 7) return `${WEEKDAYS[d.getDay()]} ${hm}`;
  return `${d.getMonth() + 1}/${d.getDate()}（${WEEKDAYS[d.getDay()]}） ${hm}`;
}

export const dateKey = (at: number) => { const d = new Date(at); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };

const ANSWER_OF: Record<Rsvp, 'attendees' | 'maybe' | 'declined'> = { yes: 'attendees', maybe: 'maybe', no: 'declined' };

/** イベントへの返事。押し直すと取り消す */
export function EventAnswer({ ev }: { ev: EventDef }) {
  const selfId = useStore((s) => s.selfId);
  const mine = (Object.keys(ANSWER_OF) as Rsvp[]).find((a) => ev[ANSWER_OF[a]].includes(selfId));
  return (
    <span className="planbtns" role="group" aria-label={tr("ui88")}>
      {(Object.keys(RSVP_LABEL) as Rsvp[]).map((a) => (
        <button key={a} className={mine === a ? 'on' : ''} aria-pressed={mine === a} onClick={() => answerEvent(ev.id, mine === a ? null : a)}>{RSVP_LABEL[a]}</button>
      ))}
    </span>
  );
}

export function Tabs<T extends string>({ items, value, onChange }: { items: { id: T; label: string; badge?: number }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="htabs" role="tablist">
      {items.map((x) => (
        <button key={x.id} role="tab" aria-selected={x.id === value} className={`ib ${x.id === value ? 'on' : ''}`} onClick={() => onChange(x.id)}>
          {x.label}{!!x.badge && <span className="badge">{x.badge}</span>}
        </button>
      ))}
    </div>
  );
}
