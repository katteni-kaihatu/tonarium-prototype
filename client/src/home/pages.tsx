import { t as tr, formatDate } from '../i18n/index.ts';
import { ItemDetail } from '../market/ItemDetail.tsx';
import { ItemArt, ItemVisual } from '../market/ItemVisual.tsx';
import { ITEM_USAGE } from '../market/itemUsage.ts';
import { GroupAvatar } from './GroupAvatar.tsx';
import { useOwnedItems, type OwnedItem } from '../market/items.ts';
import { contentAvailable, productFor } from '../../../shared/market.ts';
import { MARKET_PRODUCTS } from '../i18n/static.ts';
import { contentFieldEntries, contentText } from '../content-translations.ts';
import { useOwnedContent } from '../market/store.ts';
import { OriginBadge } from '../market/OriginBadge.tsx';
import { useEffect, useRef, useState } from 'react';
import { useUpdateDraft } from '../updateDraft.ts';
import { createPortal } from 'react-dom';
import { CHANGELOG } from '../../../shared/changelog.ts';
import { localized } from '../i18n/core.ts';
import { filterChangelog, markChangelogSeen } from './changelog.ts';
import { save, set, unreadOf, useStore, type HomePage } from '../store.ts';
import { dmKey, type EventDef, type Group, type User } from '../../../shared/protocol.ts';
import { sortForHome } from '../../../shared/home.ts';
import { WORLDS } from '../i18n/static.ts';
import { WORLD_KINDS, type WorldKind } from '../../../shared/worlds.ts';
import { askJoin, deleteEvent, deleteGroup, joinGroup, joinSession, leaveGroup, leaveSession, openDm, openGroup, toggleBlock, watchFriend } from '../actions.ts';
import { spawnItem } from '../items/actions.ts';
import { ONLY_3D } from '../../../shared/items.ts';
import { Face } from '../world/common.tsx';
import { Icon } from '../world/Icon.tsx';
import { SessionCard } from './SessionCard.tsx';
import { CreateEventDialog, CreateGroupDialog, CreateSessionDialog, InviteFriendDialog, InviteToGroupDialog } from './dialogs.tsx';
import { Chip, Empty, EventAnswer, EventHost, FollowButton, ModeIcon, NameFace, Tabs, match, dateKey, timeLabel, uniqueByName, WEEKDAYS } from './common.tsx';
import { Composer, Thread } from './messages.tsx';
import { StatusDot, StatusText, useStatusOf } from './status.tsx';

export function ChangelogPage({ q }: { q: string }) {
  const [includeMaintenance, setIncludeMaintenance] = useUpdateDraft('changelog.maintenance', false);
  useEffect(() => markChangelogSeen(), []);
  const entries = filterChangelog(localized(filterChangelog(CHANGELOG, '', includeMaintenance)), q, true);
  return (
    <section className="hsec" aria-label={tr("ui259")}>
      <label className="hchangelog-filter">
        <input type="checkbox" checked={includeMaintenance} onChange={(e) => setIncludeMaintenance(e.target.checked)} />
        {tr('changelogIncludeMaintenance')}
      </label>
      {entries.length === 0 && <Empty>{tr("ui260")}</Empty>}
      {entries.map((entry) => (
        <article className="hsec hchangelog" key={entry.id ?? `${entry.date}:${entry.title}`}>
          <time className="sub" dateTime={entry.date}>{entry.date}</time>
          <h2>{entry.title}{entry.tag && <small className="sub">{entry.tag}</small>}</h2>
          <ul>{entry.items.map((item) => <li key={item}>{item}</li>)}</ul>
        </article>
      ))}
    </section>
  );
}

type FriendLike = { id: string; name: string; session?: string | null; mode?: '2d' | '3d'; sharing?: boolean };

/** フレンドのステータスに合わせた「参加する」「行ってもいい？」 */
function JoinButton({ u }: { u: FriendLike }) {
  const st = useStatusOf(u.name);
  const sess = useStore((s) => (u.session ? s.guild.sessions.find((d) => d.id === u.session) : undefined));
  if (!st.online || !sess || st.status === 'busy') return null;
  if (st.status === 'askMe') return <button className="finvite" onClick={() => askJoin(u.id)}>{tr("ui261")}</button>;
  return <button className="finvite" onClick={() => joinSession(sess.id)}>{tr("ui194")}</button>;
}

export function FriendTile({ u, children }: { u: FriendLike; children?: React.ReactNode }) {
  const [inv, setInv] = useState(false);
  const st = useStatusOf(u.name);
  const sess = useStore((s) => (u.session ? s.guild.sessions.find((d) => d.id === u.session) : undefined));
  const where = u.session ? (sess ? tr("ui262", sess.name) : tr("ui263")) : '';
  return (
    <div className="ftile">
      <span className="fface"><Face id={u.id} name={u.name} size={36} /><StatusDot st={st} /></span>
      <span className="finfo">
        <b>{u.name}</b>
        {where && <span className="sub">{where}</span>}
        <StatusText st={st} />
      </span>
      {st.online && u.mode && <ModeIcon mode={u.mode} sharing={!!u.sharing} />}
      {children}
      <JoinButton u={u} />
      {st.online && st.status !== 'busy' && <button className="finvite" onClick={() => setInv(true)}>{tr("ui264")}</button>}
      <button className="ib square" aria-label={tr("ui265", u.name)} title={tr("ui181")} onClick={() => openDm(u.name)}><Icon name="chat" size={16} /></button>
      {inv && <InviteFriendDialog to={u} onClose={() => setInv(false)} />}
    </div>
  );
}

function FriendRow({ u, on }: { u: FriendLike; on: boolean }) {
  const st = useStatusOf(u.name);
  const unread = useStore((s) => unreadOf(s, dmKey(s.selfName, u.name)));
  const sess = useStore((s) => (u.session ? s.guild.sessions.find((d) => d.id === u.session) : undefined));
  return (
    <button className={`ib frow ${on ? 'on' : ''}`} aria-current={on} onClick={() => set({ dmWith: u.name })}>
      <span className="fface"><Face id={u.id} name={u.name} size={36} /><StatusDot st={st} /></span>
      <span className="finfo">
        <b>{u.name}</b>
        {sess && <span className="sub">{sess.name} {tr("ui266")}</span>}
        <StatusText st={st} />
      </span>
      {unread > 0 && <span className="badge">{unread}</span>}
    </button>
  );
}

function DmPane({ u }: { u: FriendLike }) {
  const selfName = useStore((s) => s.selfName);
  const watching = useStore((s) => s.watching.includes(u.name));
  const st = useStatusOf(u.name);
  const groups = useStore((s) => s.groups).filter((g) => g.members.includes(u.name) && g.members.includes(selfName));
  const conv = dmKey(selfName, u.name);
  return (
    <aside className="dmpane" aria-label={tr("ui267", u.name)}>
      <div className="dmhead">
        <span className="fface"><Face id={u.id} name={u.name} size={48} /><StatusDot st={st} /></span>
        <span className="finfo">
          <b className="dmname">{u.name}</b>
          <StatusText st={st} />
          {groups.length > 0 && <span className="sub">{tr("ui268")}{groups.map((g) => g.name).join('、')}</span>}
        </span>
        <span className="spacer" />
        <JoinButton u={u} />
        {!st.online && (
          <button className={watching ? 'on' : ''} aria-pressed={watching} title={tr("ui269")} onClick={() => watchFriend(u.name, !watching)}>
            <Icon name="bell" size={14} />{watching ? tr("ui270") : tr("ui271")}
          </button>
        )}
      </div>
      <Thread key={conv} conv={conv} empty={tr("ui272", u.name)} />
      <Composer conv={conv} placeholder={tr("ui273", u.name)} />
    </aside>
  );
}

function FollowList({ kind, q }: { kind: 'followers' | 'following'; q: string }) {
  const names = useStore((s) => s[kind]).filter((n) => match(q, n));
  const friends = useStore((s) => s.friends);
  return (
    <section className="hsec">
      <p className="sub wrap">{tr(kind === 'followers' ? 'followFollowersDesc' : 'followFollowingDesc')}</p>
      {names.length === 0 && <Empty>{tr(kind === 'followers' ? 'followNoFollowers' : 'followNoFollowing')}</Empty>}
      {names.map((name) => (
        <div key={name} className="ftile">
          <NameFace name={name} size={36} />
          <span className="finfo"><b>{name}</b>{friends.includes(name) && <span className="sub">{tr('ui153')}</span>}</span>
          <FollowButton name={name} />
        </div>
      ))}
    </section>
  );
}

function BlockedList() {
  const blocked = useStore((s) => s.blocked);
  return (
    <section className="hsec">
      <p className="sub wrap">{tr("ui278")}</p>
      {blocked.length === 0 && <Empty>{tr("ui279")}</Empty>}
      {blocked.map((name) => (
        <div key={name} className="ftile">
          <NameFace name={name} size={36} />
          <span className="finfo"><b>{name}</b></span>
          <button onClick={() => toggleBlock(name)}>{tr("ui280")}</button>
        </div>
      ))}
    </section>
  );
}

export function FriendsPage({ q }: { q: string }) {
  const users = useStore((s) => s.users);
  const friends = useStore((s) => s.friends);
  const dmWith = useStore((s) => s.dmWith);
  const following = useStore((s) => s.following);
  const notBack = useStore((s) => s.followers).filter((n) => !following.includes(n)).length;
  const tab = useStore((s) => s.friendsTab);
  const setTab = (friendsTab: typeof tab) => set({ friendsTab });
  const sessions = useStore((s) => s.guild.sessions);
  const withFriends = sortForHome(sessions.filter((d) => match(q, d.name, d.topic)), friends, users).filter((d) => friendsIn(d.id, friends, users).length > 0);
  const online: FriendLike[] = uniqueByName(users.filter((u) => friends.includes(u.name))).map((u) => ({ id: u.id, name: u.name, session: u.session, mode: u.mode, sharing: u.sharing }));
  const offline: FriendLike[] = friends.filter((n) => !online.some((u) => u.name === n)).map((n) => ({ id: n, name: n }));
  const shown = (l: FriendLike[]) => l.filter((u) => match(q, u.name));
  const selected = [...online, ...offline].find((u) => u.name === dmWith) ?? online[0] ?? offline[0];
  return (
    <>
      <Tabs value={tab} onChange={setTab} items={[{ id: 'all', label: tr("ui281") }, { id: 'now', label: tr("ui198") }, { id: 'followers', label: tr('followFollowers'), badge: notBack }, { id: 'following', label: tr('followFollowingTab') }, { id: 'block', label: tr("ui283") }]} />
      {tab === 'now' && (withFriends.length === 0
        ? <Empty>{tr("ui190")}</Empty>
        : <div className="scards">{withFriends.map((d) => <SessionCard key={d.id} s={d} />)}</div>)}
      {(tab === 'followers' || tab === 'following') && <FollowList kind={tab} q={q} />}
      {tab === 'block' && <BlockedList />}
      {tab === 'all' && friends.length === 0 && <Empty>{tr('followNoFriends')}</Empty>}
      {tab === 'all' && friends.length > 0 && (
        <div className="fpage">
          <section className="flist" aria-label={tr("ui285")}>
            {shown(online).length > 0 && <span className="hlabel">{tr("ui129")}</span>}
            {shown(online).map((u) => <FriendRow key={u.name} u={u} on={u.name === selected?.name} />)}
            {shown(offline).length > 0 && <span className="hlabel">{tr("ui130")}</span>}
            {shown(offline).map((u) => <FriendRow key={u.name} u={u} on={u.name === selected?.name} />)}
            {shown(online).length + shown(offline).length === 0 && <Empty>{tr("ui223")}</Empty>}
          </section>
          {selected && <DmPane key={selected.name} u={selected} />}
        </div>
      )}
    </>
  );
}

/** セッション中に、セッションやワールドのページの上に出す「いまいるセッション」 */
function CurrentSession({ onWorlds }: { onWorlds?: () => void }) {
  const s = useStore((st) => st.guild.sessions.find((d) => d.id === st.session));
  const world = useStore((st) => (st.session && st.worldBy[st.session]) || 'room');
  const here = useStore((st) => st.participants);
  if (!s) return null;
  return (
    <div className="hcurrent">
      <span className="hhere"><i />{tr("ui192")}</span>
      <span className="finfo"><b>{s.name}</b><span className="sub">{tr("ui286")}{WORLDS[world].name} · {here.length} {tr("ui125")}</span></span>
      <span className="stack">{here.slice(0, 5).map((u) => <Face key={u.id} id={u.id} name={u.name} size={24} ring="0 0 0 2px #FFFDF9" />)}</span>
      <span className="spacer" />
      {onWorlds && <button onClick={onWorlds}><Icon name="globe" size={14} />{tr("ui287")}</button>}
      <button className="danger" onClick={leaveSession}><Icon name="leave" size={14} />{tr("ui288")}</button>
    </div>
  );
}

export function SessionsPage({ q }: { q: string }) {
  const [selectWorld, setSelectWorld] = useState(false);
  const sessions = useStore((s) => s.guild.sessions);
  const worldBy = useStore((s) => s.worldBy);
  const inSession = useStore((s) => !!s.session);
  const list = sessions.filter((d) => match(q, d.name, d.topic, WORLDS[worldBy[d.id] ?? d.world ?? 'room'].name));
  return (
    <section className="hsec">
      {inSession && <CurrentSession onWorlds={() => setSelectWorld(true)} />}
      <h2>{tr("ui199")}<span className="sub">{sessions.length} {tr("ui196")}</span></h2>
      {list.length === 0 && <Empty>{tr("ui223")}</Empty>}
      <div className="scards">{list.map((d) => <SessionCard key={d.id} s={d} showDelete />)}</div>
      {inSession && selectWorld && createPortal(<WorldSelectDialog onClose={() => setSelectWorld(false)} />, document.body)}
    </section>
  );
}

function EventRow({ ev }: { ev: EventDef }) {
  const selfName = useStore((s) => s.selfName);
  const friends = useStore((s) => s.friends);
  const group = useStore((s) => s.groups.find((g) => g.id === ev.group));
  const session = useStore((s) => s.guild.sessions.find((d) => d.id === ev.session));
  const past = ev.at < Date.now() - 3_600_000 * 3;
  return (
    <div className={`evrow ${past ? 'past' : ''}`}>
      <span className="evtime">{timeLabel(ev.at)}</span>
      <span className="evinfo">
        <b>{ev.title}</b>
        <span className="sub">
          {group && <><i className="gdot" style={{ background: group.color }} />{group.name} · </>}
          {session ? tr("ui208", session.name) : tr("ui209")}
        </span>
        <EventHost ev={ev} />
        <span className="evfaces">
          {ev.attendees.slice(0, 8).map((n) => <NameFace key={n} name={n} size={20} />)}
          <span className="sub">{tr("ui134")}{ev.attendees.length} {tr("ui135")}{ev.maybe.length}{ev.attendees.some((n) => friends.includes(n)) && tr("ui289", ev.attendees.filter((n) => friends.includes(n)).length)}</span>
        </span>
      </span>
      <span className="row">
        {session && !past && <button className="primary" onClick={() => joinSession(session.id)}>{tr("ui206")}</button>}
        <EventAnswer ev={ev} />
        {ev.owner === selfName && <button className="ib" title={tr("ui290")} onClick={() => deleteEvent(ev.id)}><Icon name="trash" size={14} /></button>}
      </span>
    </div>
  );
}

/** 月曜はじまりの月のカレンダー。日を押すとその日のイベントだけを下に出す */
function MonthCalendar({ events, picked, onPick }: { events: EventDef[]; picked: string | null; onPick: (key: string | null) => void }) {
  const [offset, setOffset] = useUpdateDraft('events.month', 0);
  const base = new Date();
  const month = new Date(base.getFullYear(), base.getMonth() + offset, 1);
  const lead = (month.getDay() + 6) % 7;
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const byDay = new Map<string, EventDef[]>();
  for (const ev of events) byDay.set(dateKey(ev.at), [...(byDay.get(dateKey(ev.at)) ?? []), ev]);
  const WEEK_MON = [tr("ui76"), tr("ui77"), tr("ui78"), tr("ui79"), tr("ui80"), tr("ui81"), tr("ui75")];
  return (
    <div className="hcalwrap">
      <div className="hcalhead">
        <button className="ib square" aria-label={tr("ui291")} onClick={() => { setOffset(offset - 1); onPick(null); }}><Icon name="left" size={16} /></button>
        <h3>{formatDate(month, { year: 'numeric', month: 'long' })}</h3>
        <button className="ib square" aria-label={tr("ui293")} onClick={() => { setOffset(offset + 1); onPick(null); }}><Icon name="right" size={16} /></button>
        {offset !== 0 && <button className="small" onClick={() => { setOffset(0); onPick(null); }}>{tr("ui294")}</button>}
      </div>
      <div className="hcal">
        {WEEK_MON.map((d) => <span key={d} className="hcalwd">{d}</span>)}
        {Array.from({ length: lead }, (_, i) => <span key={`b${i}`} />)}
        {Array.from({ length: days }, (_, i) => {
          const d = new Date(month.getFullYear(), month.getMonth(), i + 1);
          const key = dateKey(d.getTime());
          const evs = byDay.get(key) ?? [];
          return (
            <button key={key} className={`hcalday ${key === dateKey(Date.now()) ? 'today' : ''} ${key === picked ? 'on' : ''}`} aria-pressed={key === picked} onClick={() => onPick(key === picked ? null : key)}>
              <span>{i + 1}</span>
              {evs.slice(0, 2).map((ev) => <span key={ev.id} className="hcalev">{ev.title}</span>)}
              {evs.length > 2 && <span className="hcalev more">{tr("ui295")}{evs.length - 2}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function EventsPage({ q }: { q: string }) {
  const events = useStore((s) => s.events);
  const groups = useStore((s) => s.groups);
  const [create, setCreate] = useState(false);
  const [view, setView] = useUpdateDraft<'list' | 'month'>('events.view', 'list');
  const [picked, setPicked] = useUpdateDraft<string | null>('events.day', null);
  const all = events.filter((ev) => match(q, ev.title, groups.find((g) => g.id === ev.group)?.name));
  const list = view === 'month' && picked ? all.filter((ev) => dateKey(ev.at) === picked) : all;
  const days = new Map<string, EventDef[]>();
  for (const ev of list) days.set(dateKey(ev.at), [...(days.get(dateKey(ev.at)) ?? []), ev]);
  return (
    <section className="hsec">
      <h2>
        {tr("ui131")}<span className="sub">{events.length} {tr("ui196")}</span>
        <Tabs value={view} onChange={(v) => { setView(v); setPicked(null); }} items={[{ id: 'list', label: tr("ui296") }, { id: 'month', label: tr('monthView') }]} />
        <span className="spacer" /><button className="dark" onClick={() => setCreate(true)}><Icon name="plus" size={14} />{tr("ui113")}</button>
      </h2>
      {view === 'month' && <MonthCalendar events={all} picked={picked} onPick={setPicked} />}
      {list.length === 0 && <Empty>{picked ? tr("ui297") : events.length ? tr("ui223") : tr("ui298")}</Empty>}
      {[...days.values()].map((evs) => {
        const d = new Date(evs[0].at);
        return (
          <div key={dateKey(evs[0].at)} className="evday">
            <h3>{formatDate(d, { month: 'long', day: 'numeric', weekday: 'short' })}</h3>
            {evs.map((ev) => <EventRow key={ev.id} ev={ev} />)}
          </div>
        );
      })}
      {create && <CreateEventDialog onClose={() => setCreate(false)} />}
    </section>
  );
}

function GroupRow({ g }: { g: Group }) {
  const selfName = useStore((s) => s.selfName);
  const sessions = useStore((s) => s.guild.sessions).filter((d) => d.group === g.id);
  const [inv, setInv] = useState(false);
  const member = g.members.includes(selfName);
  return (
    <div className="grow">
      <GroupAvatar group={g} />
      <span className="ginfo">
        <button className="ib glink" onClick={() => openGroup(g.id)}><b>{g.name}</b><Icon name="right" size={13} /></button>
        <span className="sub">{g.members.length} {tr("ui141")}{sessions.length} {tr("ui142")}{g.owner} {tr("ui143")}</span>
        <span className="evfaces">{g.members.slice(0, 10).map((n) => <NameFace key={n} name={n} size={20} />)}{g.members.length > 10 && <span className="sub">{tr("ui295")}{g.members.length - 10} {tr("ui125")}</span>}</span>
      </span>
      <span className="row">
        {member && <button onClick={() => setInv(true)}>{tr("ui144")}</button>}
        {member ? <button onClick={() => leaveGroup(g.id)}>{tr("ui145")}</button> : <button className="dark" onClick={() => joinGroup(g.id)}>{tr("ui146")}</button>}
        {g.owner === selfName && <button className="ib" title={tr("ui147")} onClick={() => deleteGroup(g.id)}><Icon name="trash" size={14} /></button>}
      </span>
      {inv && <InviteToGroupDialog group={g} onClose={() => setInv(false)} />}
    </div>
  );
}

export function GroupsPage({ q }: { q: string }) {
  const groups = useStore((s) => s.groups);
  const selfName = useStore((s) => s.selfName);
  const [create, setCreate] = useState(false);
  const mine = groups.filter((g) => g.members.includes(selfName) && match(q, g.name));
  const others = groups.filter((g) => !g.members.includes(selfName) && match(q, g.name));
  return (
    <section className="hsec">
      <h2>{tr("ui108")}<span className="sub">{tr("ui300")}{mine.length} / {groups.length}</span><span className="spacer" /><button className="dark" onClick={() => setCreate(true)}><Icon name="plus" size={14} />{tr("ui111")}</button></h2>
      {groups.length === 0 && <Empty>{tr("ui301")}</Empty>}
      {mine.length > 0 && <h3 className="hsub">{tr("ui302")}</h3>}
      {mine.map((g) => <GroupRow key={g.id} g={g} />)}
      {others.length > 0 && <h3 className="hsub">{tr("ui303")}</h3>}
      {others.map((g) => <GroupRow key={g.id} g={g} />)}
      {create && <CreateGroupDialog onClose={() => setCreate(false)} />}
    </section>
  );
}

export const WORLD_FACE: Record<WorldKind, string> = { room: '#DCE6F3', cafe: '#F3E6C6', game: '#E7DDF2', survivors: '#F2D5E2', city: '#D7EAD3', garden: '#DDEBCF', starlounge: '#DBE1F4', antimatter: '#D9D6F5' };

export function WorldSelectDialog({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState('');
  return (
    <div className="modalbg light" onClick={onClose} onKeyDown={(e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
    }}>
      <div className="modal hmodal world-select-modal" role="dialog" aria-modal="true" aria-label={tr('mergeSelectWorld')} onClick={(e) => e.stopPropagation()}>
        <h2>{tr('mergeSelectWorld')}<span className="spacer" /><button className="ib" aria-label={tr('閉じる')} onClick={onClose}><Icon name="close" size={18} /></button></h2>
        <input autoFocus aria-label={tr('mergeSearchWorld')} placeholder={tr('mergeSearchWorld')} value={q} onChange={(e) => setQ(e.target.value)} />
        <WorldsPage q={q} onSelected={onClose} />
        <div className="row end"><button onClick={onClose}>{tr('閉じる')}</button></div>
      </div>
    </div>
  );
}

export function WorldsPage({ q, onSelected }: { q: string; onSelected?: () => void }) {
  const owned = useOwnedContent();
  const sessions = useStore((s) => s.guild.sessions);
  const worldBy = useStore((s) => s.worldBy);
  const session = useStore((s) => s.session);
  const current = useStore((s) => (s.session && s.worldBy[s.session]) || 'room');
  const pending = useStore((s) => !!s.worldPending);
  const [create, setCreate] = useState<WorldKind | null>(null);
  // セッション中に選ぶと、いまのセッションのワールドを切り替える（確認とカウントダウンはセッション側）
  const pick = (k: WorldKind) => { onSelected?.(); set({ hubOpen: false, confirmWorld: k }); };
  return (
    <section className="hsec">
      {session && !onSelected && <CurrentSession />}
      <h2>{tr("ui105")}<span className="sub">{session ? tr("ui304") : tr("ui305")}</span></h2>
      <div className="wcards">
        {WORLD_KINDS.filter((k) => contentAvailable(owned, 'worlds', k)).filter((k) => match(q, WORLDS[k].name, WORLDS[k].desc)).map((k) => {
          const n = sessions.filter((d) => (worldBy[d.id] ?? d.world ?? 'room') === k).length;
          const now = !!session && k === current;
          return (
            <article key={k} className={`wcard ${now ? 'current' : ''}`}>
              <div className="wface" style={{ background: WORLD_FACE[k] }}><Icon name="globe" size={28} />{now && <span className="hhere"><i />{tr("ui306")}</span>}</div>
              <h3>{WORLDS[k].name}</h3><OriginBadge productId={productFor('worlds', k)?.id} />
              <p className="sub wrap">{WORLDS[k].desc}</p>
              {!!contentFieldEntries(`world/${k}`, 'instructions.').length && <details><summary>{tr('ui372')}</summary><ul>{contentFieldEntries(`world/${k}`, 'instructions.').map(([id, text]) => <li key={id} style={{ whiteSpace: 'pre-wrap' }}>{text}</li>)}</ul></details>}
              <span className="sub">{tr("ui307")}{n} {tr("ui196")}</span>
              {session && <button className="primary" disabled={now || pending} onClick={() => pick(k)}>{now ? tr("ui306") : tr("ui308")}</button>}
              {!onSelected && <button className={session ? '' : 'dark'} onClick={() => setCreate(k)}><Icon name="plus" size={14} />{tr("ui309")}</button>}
            </article>
          );
        })}
      </div>
      {create && <CreateSessionDialog world={create} onClose={() => setCreate(null)} />}
    </section>
  );
}

export function ItemsPage({ q }: { q: string }) {
  const session = useStore((s) => s.session);
  const mode = useStore((s) => s.mode);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const lastCard = useRef<string | null>(null);
  const cards = useRef(new Map<string, HTMLButtonElement>());
  const owned = useOwnedItems();
  const selected = owned.find((entry) => entry.id === selectedId);
  const entries = owned.filter(({ info }) => match(q, info.name, info.desc, info.genre));
  useEffect(() => {
    if (selectedId) heading.current?.focus();
    else if (lastCard.current) cards.current.get(lastCard.current)?.focus();
  }, [selectedId]);
  const spawn = (entry: OwnedItem) => { spawnItem(entry.kind, entry.text, undefined, entry.variant); set({ hubOpen: false }); };
  const spawnButton = (entry: OwnedItem) => {
    const only3d = !!ONLY_3D[entry.kind] && mode !== '3d';
    return session && <button className="primary small ispawn" disabled={only3d} title={only3d ? tr("ui310") : undefined} onClick={() => spawn(entry)}><Icon name="plus" size={12} />{tr("ui197")}</button>;
  };
  return <section className="hsec">
    {selected ? <ItemDetail key={selected.id} name={selected.info.name} genre={selected.info.genre} creator={selected.creator} description={selected.info.desc}
      headingRef={heading} onBack={() => setSelectedId(null)}
      visual={<ItemVisual kind={selected.kind} product={MARKET_PRODUCTS.find((p) => p.id === selected.productId)} />}
      tags={<>{selected.info.in2d && <span>{tr("ui311")}</span>}{selected.info.in3d && <span>{tr("ui312")}</span>}</>}
      usage={<span style={{ whiteSpace: 'pre-wrap' }}>{selected.usage ?? (selected.productId && selected.text ? contentText(`product/${selected.productId}`, 'text', selected.text) : selected.kind === 'bike' ? selected.info.desc : selected.productId ? tr("ui313") : ITEM_USAGE[selected.kind])}</span>}>
      {spawnButton(selected)}
    </ItemDetail> : <>
      <h2>{tr("ui154")}<span className="sub">{session ? tr("ui314") : tr("ui315")}</span></h2>
      <div className="icards">
        {entries.map((entry) => <article key={entry.id} className="icard">
          <OriginBadge productId={entry.productId} />
          <button className="item-card-open" ref={(el) => { if (el) cards.current.set(entry.id, el); else cards.current.delete(entry.id); }} onClick={() => { lastCard.current = entry.id; setSelectedId(entry.id); }} aria-label={entry.info.name + tr("ui316")}>
            <ItemArt kind={entry.kind} name={entry.info.name} className="item-card-art" />
            <span className="iinfo">
              <b>{entry.info.name} <Chip kind="genre">{entry.info.genre}</Chip>{entry.info.in2d && <Chip kind="mode">2D</Chip>}{entry.info.in3d && <Chip kind="mode">3D</Chip>}</b>
              <span className="sub wrap">{entry.info.desc}</span>
            </span>
          </button>
          {spawnButton(entry)}
        </article>)}
      </div>
    </>}
  </section>;
}

/** セッションにいるフレンド（同じ名前の複数タブは 1 人） */
export const friendsIn = (sid: string, friends: string[], users: User[]) => uniqueByName(users.filter((u) => u.session === sid && friends.includes(u.name)));

export function goHome(homePage: HomePage, friendsTab?: 'all' | 'now') {
  if (location.hash.startsWith('#/market/')) {
    const url = new URL(location.href); url.hash = ''; history.pushState(null, '', url);
  }
  set(friendsTab ? { homePage, friendsTab, marketProductId: null } : { homePage, marketProductId: null });
  save('tonarium.homePage', homePage);
  window.scrollTo(0, 0);
}
