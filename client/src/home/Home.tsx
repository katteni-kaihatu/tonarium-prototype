import { sourceText as uiSource } from '../i18n/core.ts';
import { localized, t as tr, msg } from '../i18n/index.ts';
import { useOwnedItems, type OwnedItem } from '../market/items.ts';
import { OriginBadge } from '../market/OriginBadge.tsx';
import { MarketPage } from '../market/Market.tsx';
import { ReactionLibrary } from '../market/Library.tsx';
import { contentAvailable, productFor } from '../../../shared/market.ts';
import { useOwnedContent } from '../market/store.ts';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { get, save, set, showToast, unreadOf, useStore, type HomePage, type Notice, type SideWidget } from '../store.ts';
import { WORLDS } from '../i18n/static.ts';
import { WORLD_KINDS, type WorldKind } from '../../../shared/worlds.ts';
import { joinSession } from '../actions.ts';
import { spawnItem } from '../items/actions.ts';
import { sortForHome } from '../../../shared/home.ts';
import { type EventDef } from '../../../shared/protocol.ts';
import { friendAccept, leaveSession, markNoticesRead, openDm, openGroup, removeNotice, switchMode } from '../actions.ts';
import { ProfileDialog } from '../Profile.tsx';
import { Face } from '../world/common.tsx';
import { Icon, type IconName } from '../world/Icon.tsx';
import { acceptInvite, inviteTarget } from '../world/NoticeLog.tsx';
import { SessionCard } from './SessionCard.tsx';
import { CreateSessionDialog } from './dialogs.tsx';
import { ChangelogPage, EventsPage, FriendTile, FriendsPage, GroupsPage, ItemsPage, SessionsPage, WORLD_FACE, WorldsPage, friendsIn, goHome } from './pages.tsx';
import { GroupActions, GroupPage, GroupTitle } from './GroupPage.tsx';
import { GroupAvatar } from './GroupAvatar.tsx';
import { StatusDialog, StatusDot, StatusText, useStatusOf } from './status.tsx';
import { Chip, Empty, EventAnswer, EventHost, NameFace, WEEKDAYS, dateKey, timeLabel, useMyGroups, useOnlineFriends } from './common.tsx';
import { touchOnly, usePhone } from '../phone.ts';
import { FEEDBACK_URL } from '../feedback.ts';
import { CHANGELOG } from '../i18n/static.ts';
import { useChangelog } from './changelog.ts';
import { XRLaunch } from '../xr/XRControls.tsx';

const NAV: { page: HomePage; name: string; icon: IconName }[] = localized([
  { page: 'home', name: uiSource('ui152'), icon: 'home' },
  { page: 'friends', name: uiSource('ui153'), icon: 'people' },
  { page: 'sessions', name: uiSource('ui119'), icon: 'headset' },
  { page: 'events', name: uiSource('ui131'), icon: 'calendar' },
  { page: 'groups', name: uiSource('ui108'), icon: 'flag' },
  { page: 'worlds', name: uiSource('ui105'), icon: 'globe' },
  { page: 'items', name: uiSource('ui154'), icon: 'box' },
  { page: 'market', name: uiSource('ui155'), icon: 'market' },
]);

const WEEK = 7 * 86_400_000;

/** 自分が入っている会話のうち、読んでいないものがあるもの（新しい順） */
function useUnreadConvs() {
  const inbox = useStore((s) => s.inbox);
  useStore((s) => s.reads);
  const s = get();
  return Object.keys(inbox).filter((c) => unreadOf(s, c) > 0).sort((a, b) => (inbox[b].at(-1)?.at ?? 0) - (inbox[a].at(-1)?.at ?? 0));
}
const useUpcoming = () => useStore((s) => s.events).filter((e) => e.at > Date.now() - 3_600_000 && e.at < Date.now() + WEEK);

/** セッション外では次に入るときのモードを選ぶ。 */
function ClientMode() {
  const session = useStore((s) => s.session);
  const mode = useStore((s) => (s.session ? s.mode : touchOnly ? '2d' : s.joinMode));
  const switching = useStore((s) => !!s.switching);
  const pick = (m: '2d' | '3d') => {
    if (get().session) switchMode(m);
    else { save('tonarium.joinMode', m); set({ joinMode: m }); }
  };
  return (
    <div className="hside-sec hclient">
      <span className="hlabel">{tr("ui156")}</span>
      <div role="radiogroup" aria-label={tr("ui156")} className="hseg">
        {(['2d', '3d'] as const).map((m) => (
          <button key={m} role="radio" aria-checked={mode === m} aria-label={tr("ui157", m.toUpperCase())} className={mode === m ? 'on' : ''} disabled={switching || (m === '3d' && touchOnly)}
            title={m === '3d' && touchOnly ? tr("ui158") : session ? undefined : tr("ui159")} onClick={() => pick(m)}>
            <Icon name={m === '2d' ? 'flat' : 'cube'} size={14} />{m.toUpperCase()}
          </button>
        ))}
        <XRLaunch />
      </div>
    </div>
  );
}

/** 左のメニュー。ホームの左列と、セッション中のホバーメニューで同じものを使う */
export function Sidebar({ inSession, onPick }: { inSession?: boolean; onPick?: () => void }) {
  const seen = useChangelog((s) => s.seen);
  const changelogUnread = !!CHANGELOG[0] && CHANGELOG[0].date > seen;
  const page = useStore((s) => s.homePage);
  const selfId = useStore((s) => s.selfId);
  const selfName = useStore((s) => s.selfName);
  const onlineFriends = useOnlineFriends().length;
  const upcoming = useUpcoming().length;
  const myGroups = useMyGroups();
  const homeGroup = useStore((s) => s.homeGroup);
  const unread = useUnreadConvs();
  const unreadDm = unread.filter((c) => c.startsWith('dm:')).length;
  const st = useStatusOf(selfName);
  const [profile, setProfile] = useState(false);
  const [status, setStatus] = useState(false);
  // スマホでは下のバーに主なページだけ並べ、残りは「その他」で全部を下から出す
  const phone = usePhone();
  const [more, setMore] = useState(false);
  const picked = () => { setMore(false); onPick?.(); };
  const badge = { friends: unreadDm || onlineFriends, events: upcoming } as Partial<Record<HomePage, number>>;
  return (
    <>
      {phone && more && <div className="hmorebg" onClick={() => setMore(false)} />}
      <nav className={`hside ${phone && more ? 'open' : ''}`}>
        <div className="hbrand"><img src="/brand/mark.png" alt="" /><b>{tr("ui163")}</b></div>
        <ul className="hnav">
          {NAV.map((n) => (
            <li key={n.page}>
              <button className={`ib hnavbtn ${page === n.page ? 'on' : ''}`} onClick={() => { goHome(n.page); picked(); }}>
                <Icon name={n.icon} size={18} />{n.name}
                {!!badge[n.page] && <span className={`hbadge ${n.page === 'friends' && unreadDm ? 'red' : ''}`}>{badge[n.page]}</span>}
              </button>
            </li>
          ))}
        </ul>
        <div className="hside-sec">
          <span className="hlabel">{tr("ui164")}</span>
          <div className="hgroups">
            {myGroups.length === 0 && <span className="sub">{tr("ui64")}</span>}
            {myGroups.map((g) => {
              const has = unread.some((c) => c.startsWith(`ch:${g.id}:`));
              const on = page === 'group' && homeGroup === g.id;
              return (
                <button key={g.id} className={`gmark ${on ? 'on' : ''}`} style={{ background: g.color }} title={g.name} aria-label={`${g.name}${has ? tr("ui165") : ''}`} onClick={() => { openGroup(g.id); picked(); }}>
                  <GroupAvatar group={g} />{has && <i className="gunread" />}
                </button>
              );
            })}
          </div>
        </div>
        <ClientMode />
        <span className="spacer" />
        <button className={`ib hnavbtn ${page === 'changelog' ? 'on' : ''}`} onClick={() => { goHome('changelog'); picked(); }}>
          <Icon name="calendar" size={18} />{tr("ui166")}{changelogUnread && <i className="hdot" aria-label={tr("ui167")} />}
        </button>
        <a className="ib hnavbtn hfeedback" href={FEEDBACK_URL} target="_blank" rel="noreferrer" title={tr("ui168")}><Icon name="heart" size={18} />{tr("ui169")}<Icon name="link" size={13} /></a>
        {inSession && <button className="ib hnavbtn hleave" onClick={leaveSession}><Icon name="leave" size={18} />{tr("ui170")}</button>}
        <div className="hself">
          <button className="ib hselfst" onClick={() => setStatus(true)} title={tr("ui171")}>
            <span className="fface"><Face id={selfId} name={selfName} size={36} /><StatusDot st={st} /></span>
            <span className="finfo"><b>{selfName}</b><StatusText st={st} /></span>
          </button>
          <button className="ib" aria-label={tr("ui172")} title={tr("ui173")} onClick={() => setProfile(true)}><Icon name="settings" size={18} /></button>
        </div>
        {/* 追従するサイドバーの中だと前面に出ないので、body に出す */}
        {profile && createPortal(<ProfileDialog name={selfName} onClose={() => setProfile(false)} />, document.body)}
        {status && createPortal(<StatusDialog onClose={() => setStatus(false)} />, document.body)}
        {phone && (
          <button className={`ib hnavbtn hmorebtn ${more ? 'on' : ''}`} aria-expanded={more} onClick={() => setMore(!more)}>
            {more ? <><Icon name="close" size={18} />{tr("ui73")}</> : <><span className="fface"><Face id={selfId} name={selfName} size={22} /><StatusDot st={st} /></span>{tr("ui174")}</>}
          </button>
        )}
      </nav>
    </>
  );
}

function NoticeItem({ n }: { n: Notice }) {
  const target = useStore((s) => inviteTarget(s, n));
  const isGroup = n.key?.startsWith('group:');
  return (
    <div className="hnotice">
      <Face id={n.from} name={n.fromName} size={28} />
      <span className="ntext">
        <span><b>{n.fromName}</b>{n.kind === 'friend' ? tr("ui175") : n.kind === 'online' ? tr("ui176") : tr("ui177", target ? `「${target.name}」` : tr("ui178"))}</span>
        <span className="sub">{timeLabel(n.at)}</span>
      </span>
      {n.kind === 'friend' && <button className="primary" onClick={() => friendAccept(n.from, n.id)}>{tr("ui179")}</button>}
      {n.kind === 'invite' && <button className="primary" disabled={!target} onClick={() => acceptInvite(n)}>{isGroup ? tr("ui146") : tr("ui180")}</button>}
      {n.kind === 'online' && <button className="primary" onClick={() => { openDm(n.fromName); removeNotice(n.id); }}>{tr("ui181")}</button>}
      <button className="ib" aria-label={tr("ui182")} onClick={() => removeNotice(n.id)}><Icon name="close" size={14} /></button>
    </div>
  );
}

function Bell() {
  const notices = useStore((s) => s.notices).filter((n) => n.kind === 'friend' || n.kind === 'invite' || n.kind === 'online');
  const unread = notices.some((n) => n.unread);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    markNoticesRead();
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);
  return (
    <div className="hbell" ref={ref}>
      <button className={`hbellbtn ${open ? 'on' : ''}`} aria-label={tr("ui183")} onClick={() => setOpen(!open)}><Icon name="bell" size={18} />{unread && <i className="hdot" />}</button>
      {open && (
        <div className="hpop">
          <h3>{tr("ui183")}</h3>
          {notices.length === 0 && <Empty>{tr("ui184")}</Empty>}
          {notices.map((n) => <NoticeItem key={n.id} n={n} />)}
        </div>
      )}
    </div>
  );
}

/** イベントは終わりの時刻を持たないので、始まってから 3 時間を開催中とみなす（イベントのページで過去扱いにするのと同じ） */
const LIVE_MS = 3 * 3_600_000;
const isLive = (ev: EventDef) => ev.at <= Date.now() && ev.at > Date.now() - LIVE_MS;

function EventCard({ ev }: { ev: EventDef }) {
  const friends = useStore((s) => s.friends);
  const g = useStore((s) => s.groups.find((x) => x.id === ev.group));
  const nf = ev.attendees.filter((n) => friends.includes(n)).length;
  return (
    <button className={`ib hevcard ${dateKey(ev.at) === dateKey(Date.now()) ? 'today' : ''}`} onClick={() => goHome('events')}>
      <span className="row">{isLive(ev) && <span className="hchip live">{tr("ui185")}</span>}<span className="evtime">{timeLabel(ev.at)}</span><span className="spacer" />{g && <span className="sub">{g.name}</span>}</span>
      <b>{ev.title}</b>
      <EventHost ev={ev} />
      <span className="evfaces">
        {ev.attendees.slice(0, 4).map((n) => <NameFace key={n} name={n} size={20} />)}
        <span className="sub">{nf ? tr("ui186", nf) : tr("ui187", ev.attendees.length)}</span>
      </span>
    </button>
  );
}

function EventsWidget() {
  const events = useStore((s) => s.events);
  const upcoming = useUpcoming().slice(0, 4);
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  // 月曜はじまりの今週
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const days = Array.from({ length: 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  const has = new Set(events.map((e) => dateKey(e.at)));
  return (
    <>
      <div className="hweek">
        {days.map((d) => (
          <span key={d.getDate()} className={`hday ${dateKey(d.getTime()) === dateKey(Date.now()) ? 'today' : ''}`}>
            <small>{WEEKDAYS[d.getDay()]}</small><b>{d.getDate()}</b>{has.has(dateKey(d.getTime())) && <i />}
          </span>
        ))}
      </div>
      {upcoming.length === 0 && <Empty>{tr("ui188")}</Empty>}
      {upcoming.map((ev) => <EventCard key={ev.id} ev={ev} />)}
      <button className="ib hlink" onClick={() => goHome('events')}>{tr("ui189")}</button>
    </>
  );
}

const WORLD_TINT: Record<string, string> = { room: '#DCE6F3', cafe: '#F3E6C6', game: '#E7DDF2', city: '#D7EAD3', garden: '#DDEBCF', starlounge: '#DBE1F4', antimatter: '#D9D6F5' };

/** フレンドの今／参加できるセッション：セッションの行。押すと参加する（セッション中なら移動） */
function SessionRows({ onlyFriends }: { onlyFriends: boolean }) {
  const sessions = useStore((s) => s.guild.sessions);
  const users = useStore((s) => s.users);
  const friends = useStore((s) => s.friends);
  const worldBy = useStore((s) => s.worldBy);
  const current = useStore((s) => s.session);
  const rows = sortForHome(sessions, friends, users)
    .map((d) => {
      const here = users.filter((u) => u.session === d.id);
      return { d, here, nf: here.filter((u) => friends.includes(u.name)).length, world: worldBy[d.id] ?? d.world ?? 'room' };
    })
    .filter((r) => !onlyFriends || r.nf > 0);
  if (!rows.length) return <Empty>{onlyFriends ? tr("ui190") : tr("ui191")}</Empty>;
  return (
    <div className="hwlist">
      {rows.map(({ d, here, nf, world }) => (
        <button key={d.id} className="ib hwrow" onClick={() => joinSession(d.id)} title={current === d.id ? tr("ui192") : current ? tr("ui193") : tr("ui194")}>
          <span className="hwthumb" style={{ background: WORLD_TINT[world] }}><Icon name="globe" size={14} /></span>
          <span className="finfo"><b>{d.name}</b><span className="sub">{WORLDS[world].name} · {here.length} {tr("ui125")}{nf ? tr("ui195", nf) : ''}</span></span>
          {current === d.id && <span className="hhere small"><i />{tr("ui192")}</span>}
        </button>
      ))}
    </div>
  );
}

function WorldsWidget() {
  const owned = useOwnedContent();
  const sessions = useStore((s) => s.guild.sessions);
  const worldBy = useStore((s) => s.worldBy);
  return (
    <div className="hwlist">
      {WORLD_KINDS.filter((k) => contentAvailable(owned, 'worlds', k)).map((k) => (
        <div key={k} className="market-entry"><button className="ib hwrow" onClick={() => goHome('worlds')}>
          <span className="hwthumb" style={{ background: WORLD_TINT[k] }}><Icon name="globe" size={14} /></span>
          <span className="finfo"><b>{WORLDS[k].name}</b><span className="sub">{tr("ui119")}{sessions.filter((d) => (worldBy[d.id] ?? d.world ?? 'room') === k).length} {tr("ui196")}</span></span>
        </button><OriginBadge productId={productFor('worlds', k)?.id} /></div>
      ))}
    </div>
  );
}

function ItemsWidget() {
  const session = useStore((s) => s.session);
  const entries = useOwnedItems();
  // セッション中はそのまま目の前に出す。外ではアイテムのページへ
  const pick = (entry: OwnedItem) => { if (session) { spawnItem(entry.kind, entry.text); set({ hubOpen: false }); } else goHome('items'); };
  return (
    <div className="hwlist">
      {entries.map((entry) => (
        <div key={entry.id} className="market-entry"><button className="ib hwrow" onClick={() => pick(entry)} title={session ? tr("ui197") : undefined}>
          <span className="hwthumb" style={{ background: entry.info.tint, color: entry.info.ink, fontWeight: 800, fontSize: entry.info.mark.length > 2 ? 11 : 16 }}>{entry.info.mark}</span>
          <span className="finfo"><b>{entry.info.name}</b><span className="sub">{entry.info.genre}</span></span>
        </button><OriginBadge productId={entry.productId} /></div>
      ))}
    </div>
  );
}

const WIDGETS: { id: SideWidget; label: string; page: HomePage }[] = localized([
  { id: 'now', label: uiSource('ui198'), page: 'friends' },
  { id: 'events', label: uiSource('ui131'), page: 'events' },
  { id: 'sessions', label: uiSource('ui199'), page: 'sessions' },
  { id: 'worlds', label: uiSource('ui105'), page: 'worlds' },
  { id: 'items', label: uiSource('ui154'), page: 'items' },
]);

/** 右の欄。タイトルのドロップダウンで中身を選ぶ（ブラウザに保存） */
function SideArea() {
  const widget = useStore((s) => s.sideWidget);
  const [dd, setDd] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!dd) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setDd(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [dd]);
  const cur = WIDGETS.find((w) => w.id === widget) ?? WIDGETS[1];
  return (
    <aside className="hevents" aria-label={tr("ui200")}>
      <div className="hwhead" ref={ref}>
        <button className="ib hwtitle" aria-haspopup="menu" aria-expanded={dd} onClick={() => setDd(!dd)}><b>{cur.label}</b><Icon name="down" size={16} /></button>
        <button className="ib hiconbtn" aria-label={tr("ui201", cur.label)} onClick={() => goHome(cur.page)}><Icon name="right" size={14} /></button>
        {dd && (
          <div role="menu" aria-label={tr("ui202")} className="hwmenu">
            {WIDGETS.map((w) => (
              <button key={w.id} role="menuitem" className="ib" onClick={() => { save('tonarium.sideWidget', w.id); set({ sideWidget: w.id }); setDd(false); }}>
                <span>{w.label}</span>{w.id === cur.id && <Icon name="check" size={16} />}
              </button>
            ))}
          </div>
        )}
      </div>
      {cur.id === 'now' && <SessionRows onlyFriends />}
      {cur.id === 'events' && <EventsWidget />}
      {cur.id === 'sessions' && <SessionRows onlyFriends={false} />}
      {cur.id === 'worlds' && <WorldsWidget />}
      {cur.id === 'items' && <ItemsWidget />}
    </aside>
  );
}

const match = (q: string, ...texts: (string | undefined)[]) => !q || texts.some((t) => t?.toLowerCase().includes(q.toLowerCase()));

/** ホームの 1 段だけのセクション。続きはタイトルの横の「もっと見る」から各ページへ */
function RowSection({ title, sub, onMore, empty, children }: { title: string; sub?: string; onMore: () => void; empty?: string; children: React.ReactNode[] }) {
  // empty が無いセクションは、出すものが無ければセクションごと出さない
  if (children.length === 0 && !empty) return null;
  return (
    <section className="hsec">
      <h2>{title} {sub && <span className="sub">{sub}</span>}<button className="ib hlink" onClick={onMore}>{tr("ui203")}</button></h2>
      {children.length === 0 ? <Empty>{empty}</Empty> : <div className="hrow">{children}</div>}
    </section>
  );
}

/** セッションのカードと同じ形のイベントのカード */
function EventTile({ ev }: { ev: EventDef }) {
  const friends = useStore((s) => s.friends);
  const selfName = useStore((s) => s.selfName);
  const g = useStore((s) => s.groups.find((x) => x.id === ev.group));
  const venue = useStore((s) => s.guild.sessions.find((d) => d.id === ev.session));
  const current = useStore((s) => s.session);
  const live = isLive(ev);
  const nf = ev.attendees.filter((n) => friends.includes(n)).length;
  return (
    <article className="scard">
      <div className="schead" style={{ background: live ? '#FDE2DD' : 'var(--accentbg)' }}>
        {live ? <span className="hchip live solid">{tr("ui185")}</span> : <span className="pill dark">{timeLabel(ev.at)}</span>}
        {live && <span className="sub">{timeLabel(ev.at)} {tr("ui204")}</span>}
        <span className="spacer" />
        {venue && (current === venue.id
          ? <span className="hhere"><i />{tr("ui205")}</span>
          : <button className="primary scjoin" onClick={() => joinSession(venue.id)}>{tr("ui206")}</button>)}
      </div>
      <div className="scbody">
        <div className="sctitle">
          <h3 title={ev.title}>{ev.title}</h3>
          {ev.attendees.includes(selfName) && <Chip kind="friends">{tr("ui207")}</Chip>}
        </div>
        <span className="sub">{g && <><i className="gdot" style={{ background: g.color }} />{g.name} · </>}{venue ? tr("ui208", venue.name) : tr("ui209")}</span>
        <EventHost ev={ev} />
        <div className="scpeople">
          <b className={nf ? 'acc' : ''}>{nf ? tr("ui210", nf) : tr("ui211", ev.attendees.length)} {tr("ui135")}{ev.maybe.length}</b>
          {ev.attendees.length > 0 && <span className="evfaces">{ev.attendees.slice(0, 6).map((n) => <NameFace key={n} name={n} size={22} />)}</span>}
        </div>
        <EventAnswer ev={ev} />
      </div>
    </article>
  );
}

/** セッションのカードと同じ形のワールドのカード */
function WorldTile({ k }: { k: WorldKind }) {
  const n = useStore((s) => s.guild.sessions.filter((d) => (s.worldBy[d.id] ?? d.world ?? 'room') === k).length);
  const [create, setCreate] = useState(false);
  return (
    <article className="scard market-world-tile"><OriginBadge productId={productFor('worlds', k)?.id} />
      <div className="schead" style={{ background: WORLD_FACE[k] }}>
        <span className="pill dark">{tr("ui119")}{n} {tr("ui196")}</span>
        <span className="spacer" />
        <button className="dark scjoin" onClick={() => setCreate(true)}><Icon name="plus" size={14} />{tr("ui101")}</button>
      </div>
      <div className="scbody">
        <div className="sctitle"><h3>{WORLDS[k].name}</h3><Chip kind="genre">{productFor('worlds', k)?.creator ?? 'Tonarium'}</Chip></div>
        <span className="sub wrap">{WORLDS[k].desc}</span>
      </div>
      {create && createPortal(<CreateSessionDialog world={k} onClose={() => setCreate(false)} />, document.body)}
    </article>
  );
}

const DAY = 86_400_000;

function HomePageView({ q }: { q: string }) {
  const owned = useOwnedContent();
  const sessions = useStore((s) => s.guild.sessions);
  const users = useStore((s) => s.users);
  const friends = useStore((s) => s.friends);
  const selfName = useStore((s) => s.selfName);
  const events = useStore((s) => s.events);
  const onlineFriends = useOnlineFriends();
  const found = sortForHome(sessions.filter((d) => match(q, d.name, d.topic)), friends, users);
  const withFriends = found.filter((d) => friendsIn(d.id, friends, users).length > 0);
  // 見えているセッションは入れるものだけなので、フレンドがいないものをそのまま並べる
  const others = found.filter((d) => friendsIn(d.id, friends, users).length === 0);
  const soon = events
    .filter((e) => match(q, e.title) && (isLive(e) || (e.at > Date.now() && e.at < Date.now() + WEEK)))
    .sort((a, b) => Number(isLive(b)) - Number(isLive(a)) || a.at - b.at);
  // 24 時間以内に「来る」と答えたイベントがあれば、イベントを一番上に出す
  const mineSoon = soon.some((e) => e.attendees.includes(selfName) && e.at < Date.now() + DAY);
  const worlds = WORLD_KINDS.filter((k) => contentAvailable(owned, 'worlds', k)).filter((k) => match(q, WORLDS[k].name, WORLDS[k].desc));
  // 参加できるセッションの中にいないフレンド
  const idle = onlineFriends.filter((u) => !sessions.some((d) => d.id === u.session) && match(q, u.name));
  const eventsRow = (
    <RowSection title={tr("ui212")} sub={tr("ui213")} onMore={() => goHome('events')}>
      {soon.map((ev) => <EventTile key={ev.id} ev={ev} />)}
    </RowSection>
  );
  return (
    <>
      {mineSoon && eventsRow}
      <RowSection title={tr("ui198")} sub={tr("ui214")} onMore={() => goHome('friends', 'now')}>
        {withFriends.map((d) => <SessionCard key={d.id} s={d} />)}
      </RowSection>
      <RowSection title={tr("ui215")} sub={tr("ui216")} onMore={() => goHome('friends', 'all')} empty={onlineFriends.length ? tr("ui217") : tr("ui218")}>
        {idle.map((u) => <FriendTile key={u.id} u={u} />)}
      </RowSection>
      {!mineSoon && eventsRow}
      <RowSection title={tr("ui219")} sub={tr("ui220")} onMore={() => goHome('sessions')} empty={tr("ui221")}>
        {others.map((d) => <SessionCard key={d.id} s={d} />)}
      </RowSection>
      <RowSection title={tr("ui222")} onMore={() => goHome('worlds')} empty={tr("ui223")}>
        {worlds.map((k) => <WorldTile key={k} k={k} />)}
      </RowSection>
    </>
  );
}

/** sheet はセッション中に重ねて開く形（SessionMenu） */
export function Home({ sheet }: { sheet?: boolean }) {
  const page = useStore((s) => s.homePage);
  const wsConnected = useStore((s) => s.wsConnected);
  const [q, setQ] = useState('');
  const [create, setCreate] = useState(false);
  const title = NAV.find((n) => n.page === page)?.name ?? (page === 'sounds' ? tr("ui224") : page === 'emotes' ? tr("ui225") : undefined);
  useEffect(() => setQ(''), [page]);
  return (
    <div className={`home ${sheet ? 'sheet' : ''} ${page === 'market' ? 'market-home' : ''}`} role={sheet ? 'dialog' : undefined} aria-label={sheet ? title : undefined}>
      <Sidebar inSession={sheet} />
      <main className="hmain">
        <header className="hhead">
          {page === 'group' ? <GroupTitle /> : title && <h1>{title}</h1>}
          {!wsConnected && <span className="reconn">{tr("ui226")}</span>}
          <span className="spacer" />
          {/* グループの画面は絞り込むものがないので出さない */}
          {page !== 'group' && <label className="hsearch"><Icon name="search" size={16} /><input value={q} aria-label={page === 'changelog' ? tr("ui227") : page === 'market' ? tr("ui228") : tr("ui229")} placeholder={page === 'changelog' ? tr("ui230") : page === 'market' ? tr("ui228") : tr("ui231")} onChange={(e) => setQ(e.target.value)} /></label>}
          <Bell />
          {page === 'group' ? <GroupActions /> : <button className="dark hcreate" onClick={() => setCreate(true)}><Icon name="plus" size={16} />{tr("ui101")}</button>}
        </header>
        <div className="hcontent" key={page} tabIndex={sheet ? 0 : undefined}>
          {page === 'home' && <HomePageView q={q} />}
          {page === 'friends' && <FriendsPage q={q} />}
          {page === 'sessions' && <SessionsPage q={q} />}
          {page === 'events' && <EventsPage q={q} />}
          {page === 'groups' && <GroupsPage q={q} />}
          {page === 'group' && <GroupPage />}
          {page === 'worlds' && <WorldsPage q={q} />}
          {page === 'items' && <ItemsPage q={q} />}
          {page === 'market' && <MarketPage q={q} />}
          {page === 'changelog' && <ChangelogPage q={q} />}
          {(page === 'sounds' || page === 'emotes') && <ReactionLibrary category={page} q={q} />}
        </div>
      </main>
      {/* グループの画面は自分の右の列を持っているので出さない */}
      {page !== 'group' && page !== 'market' && <SideArea />}
      {create && <CreateSessionDialog onClose={() => setCreate(false)} />}
    </div>
  );
}
