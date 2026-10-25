import { ItemDetail } from '../market/ItemDetail.tsx';
import { ItemArt, ItemVisual } from '../market/ItemVisual.tsx';
import { ITEM_USAGE } from '../market/itemUsage.ts';
import { GroupAvatar } from './GroupAvatar.tsx';
import { useOwnedItems, type OwnedItem } from '../market/items.ts';
import { MARKET_PRODUCTS, contentAvailable, productFor } from '../../../shared/market.ts';
import { useOwnedContent } from '../market/store.ts';
import { OriginBadge } from '../market/OriginBadge.tsx';
import { useEffect, useRef, useState } from 'react';
import { CHANGELOG } from '../../../shared/changelog.ts';
import { markChangelogSeen } from './changelog.ts';
import { save, set, unreadOf, useStore, type HomePage } from '../store.ts';
import { dmKey, type EventDef, type Group, type User } from '../../../shared/protocol.ts';
import { sortForHome } from '../../../shared/home.ts';
import { WORLDS, WORLD_KINDS, type WorldKind } from '../../../shared/worlds.ts';
import { askJoin, deleteEvent, deleteGroup, friendAccept, joinGroup, joinSession, leaveGroup, leaveSession, openDm, openGroup, removeNotice, toggleBlock, watchFriend } from '../actions.ts';
import { spawnItem } from '../items/actions.ts';
import { ONLY_3D } from '../../../shared/items.ts';
import { Face } from '../world/common.tsx';
import { Icon } from '../world/Icon.tsx';
import { SessionCard } from './SessionCard.tsx';
import { CreateEventDialog, CreateGroupDialog, CreateSessionDialog, InviteFriendDialog, InviteToGroupDialog } from './dialogs.tsx';
import { Chip, Empty, EventAnswer, EventHost, ModeIcon, NameFace, Tabs, dateKey, timeLabel, uniqueByName, WEEKDAYS } from './common.tsx';
import { Composer, Thread } from './messages.tsx';
import { StatusDot, StatusText, useStatusOf } from './status.tsx';

const match = (q: string, ...texts: (string | undefined)[]) => !q || texts.some((t) => t?.toLowerCase().includes(q.toLowerCase()));

export function ChangelogPage({ q }: { q: string }) {
  useEffect(() => markChangelogSeen(), []);
  const entries = CHANGELOG.filter((entry) => match(q, entry.title, ...entry.items));
  return (
    <section className="hsec" aria-label="変更履歴の一覧">
      {entries.length === 0 && <Empty>該当する変更履歴はありません</Empty>}
      {entries.map((entry) => (
        <article className="hsec hchangelog" key={`${entry.date}:${entry.title}`}>
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
  if (st.status === 'askMe') return <button className="finvite" onClick={() => askJoin(u.id)}>行ってもいい？</button>;
  return <button className="finvite" onClick={() => joinSession(sess.id)}>参加する</button>;
}

export function FriendTile({ u, children }: { u: FriendLike; children?: React.ReactNode }) {
  const [inv, setInv] = useState(false);
  const st = useStatusOf(u.name);
  const sess = useStore((s) => (u.session ? s.guild.sessions.find((d) => d.id === u.session) : undefined));
  const where = u.session ? (sess ? `${sess.name} にいます` : '別のセッションにいます') : '';
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
      {st.online && st.status !== 'busy' && <button className="finvite" onClick={() => setInv(true)}>誘う</button>}
      <button className="ib square" aria-label={`${u.name} にメッセージ`} title="メッセージ" onClick={() => openDm(u.name)}><Icon name="chat" size={16} /></button>
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
        {sess && <span className="sub">{sess.name} にいます</span>}
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
    <aside className="dmpane" aria-label={`${u.name} とのやりとり`}>
      <div className="dmhead">
        <span className="fface"><Face id={u.id} name={u.name} size={48} /><StatusDot st={st} /></span>
        <span className="finfo">
          <b className="dmname">{u.name}</b>
          <StatusText st={st} />
          {groups.length > 0 && <span className="sub">同じグループ：{groups.map((g) => g.name).join('、')}</span>}
        </span>
        <span className="spacer" />
        <JoinButton u={u} />
        {!st.online && (
          <button className={watching ? 'on' : ''} aria-pressed={watching} title="オンラインになったら 1 回だけ通知します" onClick={() => watchFriend(u.name, !watching)}>
            <Icon name="bell" size={14} />{watching ? '知らせを待っています' : '来たら知らせる'}
          </button>
        )}
      </div>
      <Thread key={conv} conv={conv} empty={`${u.name} とのメッセージはまだありません。いなくても送っておけます`} />
      <Composer conv={conv} placeholder={`${u.name} にメッセージを送信`} />
    </aside>
  );
}

function FriendRequests() {
  const notices = useStore((s) => s.notices).filter((n) => n.kind === 'friend');
  return (
    <section className="hsec">
      <h3 className="hsub">届いたフレンド申請</h3>
      {notices.length === 0 && <Empty>届いている申請はありません</Empty>}
      {notices.map((n) => (
        <div key={n.id} className="ftile">
          <Face id={n.from} name={n.fromName} size={36} />
          <span className="finfo"><b>{n.fromName}</b><span className="sub">{timeLabel(n.at)}</span></span>
          <button onClick={() => removeNotice(n.id)}>拒否</button>
          <button className="primary" onClick={() => friendAccept(n.from, n.id)}>承認する</button>
        </div>
      ))}
    </section>
  );
}

function BlockedList() {
  const blocked = useStore((s) => s.blocked);
  return (
    <section className="hsec">
      <p className="sub wrap">ブロックした人の声・チャット・通知・効果音は、あなたに届かなくなります（このブラウザだけに保存）。</p>
      {blocked.length === 0 && <Empty>ブロックしている人はいません</Empty>}
      {blocked.map((name) => (
        <div key={name} className="ftile">
          <NameFace name={name} size={36} />
          <span className="finfo"><b>{name}</b></span>
          <button onClick={() => toggleBlock(name)}>ブロックを解除</button>
        </div>
      ))}
    </section>
  );
}

export function FriendsPage({ q }: { q: string }) {
  const users = useStore((s) => s.users);
  const friends = useStore((s) => s.friends);
  const dmWith = useStore((s) => s.dmWith);
  const requests = useStore((s) => s.notices).filter((n) => n.kind === 'friend').length;
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
      <Tabs value={tab} onChange={setTab} items={[{ id: 'all', label: 'すべて' }, { id: 'now', label: 'フレンドの今' }, { id: 'req', label: 'リクエスト', badge: requests }, { id: 'block', label: 'ブロック中' }]} />
      {tab === 'now' && (withFriends.length === 0
        ? <Empty>フレンドがいるセッションはありません</Empty>
        : <div className="scards">{withFriends.map((d) => <SessionCard key={d.id} s={d} />)}</div>)}
      {tab === 'req' && <FriendRequests />}
      {tab === 'block' && <BlockedList />}
      {tab === 'all' && friends.length === 0 && <Empty>まだフレンドがいません。セッションの中で相手のプロフィールからフレンド申請できます</Empty>}
      {tab === 'all' && friends.length > 0 && (
        <div className="fpage">
          <section className="flist" aria-label="フレンド一覧">
            {shown(online).length > 0 && <span className="hlabel">オンライン</span>}
            {shown(online).map((u) => <FriendRow key={u.name} u={u} on={u.name === selected?.name} />)}
            {shown(offline).length > 0 && <span className="hlabel">オフライン</span>}
            {shown(offline).map((u) => <FriendRow key={u.name} u={u} on={u.name === selected?.name} />)}
            {shown(online).length + shown(offline).length === 0 && <Empty>見つかりません</Empty>}
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
      <span className="hhere"><i />参加中</span>
      <span className="finfo"><b>{s.name}</b><span className="sub">ワールド：{WORLDS[world].name} · {here.length} 人</span></span>
      <span className="stack">{here.slice(0, 5).map((u) => <Face key={u.id} id={u.id} name={u.name} size={24} ring="0 0 0 2px #FFFDF9" />)}</span>
      <span className="spacer" />
      {onWorlds && <button onClick={onWorlds}><Icon name="globe" size={14} />ワールドを切り替える</button>}
      <button className="danger" onClick={leaveSession}><Icon name="leave" size={14} />離脱</button>
    </div>
  );
}

export function SessionsPage({ q }: { q: string }) {
  const sessions = useStore((s) => s.guild.sessions);
  const worldBy = useStore((s) => s.worldBy);
  const inSession = useStore((s) => !!s.session);
  const list = sessions.filter((d) => match(q, d.name, d.topic, WORLDS[worldBy[d.id] ?? d.world ?? 'room'].name));
  return (
    <section className="hsec">
      {inSession && <CurrentSession onWorlds={() => goHome('worlds')} />}
      <h2>参加できるセッション <span className="sub">{sessions.length} 件</span></h2>
      {list.length === 0 && <Empty>見つかりません</Empty>}
      <div className="scards">{list.map((d) => <SessionCard key={d.id} s={d} showDelete />)}</div>
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
          {session ? `会場：${session.name}` : '会場なし'}
        </span>
        <EventHost ev={ev} />
        <span className="evfaces">
          {ev.attendees.slice(0, 8).map((n) => <NameFace key={n} name={n} size={20} />)}
          <span className="sub">来る {ev.attendees.length} · たぶん {ev.maybe.length}{ev.attendees.some((n) => friends.includes(n)) && `（フレンド ${ev.attendees.filter((n) => friends.includes(n)).length} 人）`}</span>
        </span>
      </span>
      <span className="row">
        {session && !past && <button className="primary" onClick={() => joinSession(session.id)}>会場へ</button>}
        <EventAnswer ev={ev} />
        {ev.owner === selfName && <button className="ib" title="このイベントを消す" onClick={() => deleteEvent(ev.id)}><Icon name="trash" size={14} /></button>}
      </span>
    </div>
  );
}

/** 月曜はじまりの月のカレンダー。日を押すとその日のイベントだけを下に出す */
function MonthCalendar({ events, picked, onPick }: { events: EventDef[]; picked: string | null; onPick: (key: string | null) => void }) {
  const [offset, setOffset] = useState(0);
  const base = new Date();
  const month = new Date(base.getFullYear(), base.getMonth() + offset, 1);
  const lead = (month.getDay() + 6) % 7;
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const byDay = new Map<string, EventDef[]>();
  for (const ev of events) byDay.set(dateKey(ev.at), [...(byDay.get(dateKey(ev.at)) ?? []), ev]);
  const WEEK_MON = ['月', '火', '水', '木', '金', '土', '日'];
  return (
    <div className="hcalwrap">
      <div className="hcalhead">
        <button className="ib square" aria-label="前の月" onClick={() => { setOffset(offset - 1); onPick(null); }}><Icon name="left" size={16} /></button>
        <h3>{month.getFullYear()}年 {month.getMonth() + 1}月</h3>
        <button className="ib square" aria-label="次の月" onClick={() => { setOffset(offset + 1); onPick(null); }}><Icon name="right" size={16} /></button>
        {offset !== 0 && <button className="small" onClick={() => { setOffset(0); onPick(null); }}>今月</button>}
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
              {evs.length > 2 && <span className="hcalev more">ほか {evs.length - 2}</span>}
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
  const [view, setView] = useState<'list' | 'month'>('list');
  const [picked, setPicked] = useState<string | null>(null);
  const all = events.filter((ev) => match(q, ev.title, groups.find((g) => g.id === ev.group)?.name));
  const list = view === 'month' && picked ? all.filter((ev) => dateKey(ev.at) === picked) : all;
  const days = new Map<string, EventDef[]>();
  for (const ev of list) days.set(dateKey(ev.at), [...(days.get(dateKey(ev.at)) ?? []), ev]);
  return (
    <section className="hsec">
      <h2>
        イベント <span className="sub">{events.length} 件</span>
        <Tabs value={view} onChange={(v) => { setView(v); setPicked(null); }} items={[{ id: 'list', label: 'リスト' }, { id: 'month', label: '月' }]} />
        <span className="spacer" /><button className="dark" onClick={() => setCreate(true)}><Icon name="plus" size={14} />イベントを作る</button>
      </h2>
      {view === 'month' && <MonthCalendar events={all} picked={picked} onPick={setPicked} />}
      {list.length === 0 && <Empty>{picked ? 'この日のイベントはありません' : events.length ? '見つかりません' : 'イベントはまだありません'}</Empty>}
      {[...days.values()].map((evs) => {
        const d = new Date(evs[0].at);
        return (
          <div key={dateKey(evs[0].at)} className="evday">
            <h3>{d.getMonth() + 1}月{d.getDate()}日（{WEEKDAYS[d.getDay()]}）</h3>
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
        <span className="sub">{g.members.length} 人 · セッション {sessions.length} 件 · {g.owner} が作成</span>
        <span className="evfaces">{g.members.slice(0, 10).map((n) => <NameFace key={n} name={n} size={20} />)}{g.members.length > 10 && <span className="sub">ほか {g.members.length - 10} 人</span>}</span>
      </span>
      <span className="row">
        {member && <button onClick={() => setInv(true)}>フレンドを誘う</button>}
        {member ? <button onClick={() => leaveGroup(g.id)}>抜ける</button> : <button className="dark" onClick={() => joinGroup(g.id)}>入る</button>}
        {g.owner === selfName && <button className="ib" title="このグループを消す" onClick={() => deleteGroup(g.id)}><Icon name="trash" size={14} /></button>}
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
      <h2>グループ <span className="sub">所属 {mine.length} / {groups.length}</span><span className="spacer" /><button className="dark" onClick={() => setCreate(true)}><Icon name="plus" size={14} />グループを作る</button></h2>
      {groups.length === 0 && <Empty>グループはまだありません</Empty>}
      {mine.length > 0 && <h3 className="hsub">所属しているグループ</h3>}
      {mine.map((g) => <GroupRow key={g.id} g={g} />)}
      {others.length > 0 && <h3 className="hsub">ほかのグループ</h3>}
      {others.map((g) => <GroupRow key={g.id} g={g} />)}
      {create && <CreateGroupDialog onClose={() => setCreate(false)} />}
    </section>
  );
}

export const WORLD_FACE: Record<WorldKind, string> = { room: '#DCE6F3', cafe: '#F3E6C6', game: '#E7DDF2', survivors: '#F2D5E2', city: '#D7EAD3', garden: '#DDEBCF', starlounge: '#DBE1F4' };

export function WorldsPage({ q }: { q: string }) {
  const owned = useOwnedContent();
  const sessions = useStore((s) => s.guild.sessions);
  const worldBy = useStore((s) => s.worldBy);
  const session = useStore((s) => s.session);
  const current = useStore((s) => (s.session && s.worldBy[s.session]) || 'room');
  const pending = useStore((s) => !!s.worldPending);
  const [create, setCreate] = useState<WorldKind | null>(null);
  // セッション中に選ぶと、いまのセッションのワールドを切り替える（確認とカウントダウンはセッション側）
  const pick = (k: WorldKind) => { set({ hubOpen: false, confirmWorld: k }); };
  return (
    <section className="hsec">
      {session && <CurrentSession />}
      <h2>ワールド <span className="sub">{session ? '選ぶと、いまのセッションのワールドを切り替える' : 'セッションが読み込む 3D 空間'}</span></h2>
      <div className="wcards">
        {WORLD_KINDS.filter((k) => contentAvailable(owned, 'worlds', k)).filter((k) => match(q, WORLDS[k].name, WORLDS[k].desc)).map((k) => {
          const n = sessions.filter((d) => (worldBy[d.id] ?? d.world ?? 'room') === k).length;
          const now = !!session && k === current;
          return (
            <article key={k} className={`wcard ${now ? 'current' : ''}`}>
              <div className="wface" style={{ background: WORLD_FACE[k] }}><Icon name="globe" size={28} />{now && <span className="hhere"><i />いまのワールド</span>}</div>
              <h3>{WORLDS[k].name}</h3><OriginBadge productId={productFor('worlds', k)?.id} />
              <p className="sub wrap">{WORLDS[k].desc}</p>
              <span className="sub">このワールドのセッション {n} 件</span>
              {session && <button className="primary" disabled={now || pending} onClick={() => pick(k)}>{now ? 'いまのワールド' : 'このワールドに切り替える'}</button>}
              <button className={session ? '' : 'dark'} onClick={() => setCreate(k)}><Icon name="plus" size={14} />このワールドでセッションを作る</button>
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
  const spawn = (entry: OwnedItem) => { spawnItem(entry.kind, entry.text); set({ hubOpen: false }); };
  const spawnButton = (entry: OwnedItem) => {
    const only3d = !!ONLY_3D[entry.kind] && mode !== '3d';
    return session && <button className="primary small ispawn" disabled={only3d} title={only3d ? '3D でのみ出せます' : undefined} onClick={() => spawn(entry)}><Icon name="plus" size={12} />目の前に出す</button>;
  };
  return <section className="hsec">
    {selected ? <ItemDetail key={selected.id} name={selected.info.name} genre={selected.info.genre} creator={selected.creator} description={selected.info.desc}
      headingRef={heading} onBack={() => setSelectedId(null)}
      visual={<ItemVisual kind={selected.kind} product={MARKET_PRODUCTS.find((p) => p.id === selected.productId)} />}
      tags={<>{selected.info.in2d && <span>2D 対応</span>}{selected.info.in3d && <span>3D 対応</span>}</>}
      usage={selected.productId ? 'アイテム一覧やセッション内の所持アイテムから「目の前に出す」を選びます。質問・挨拶入りの付箋として配置され、自由に編集できます。' : ITEM_USAGE[selected.kind]}>
      {spawnButton(selected)}
    </ItemDetail> : <>
      <h2>アイテム <span className="sub">{session ? '目の前に出せる' : 'セッションの中で「出す」と使える'}</span></h2>
      <div className="icards">
        {entries.map((entry) => <article key={entry.id} className="icard">
          <OriginBadge productId={entry.productId} />
          <button className="item-card-open" ref={(el) => { if (el) cards.current.set(entry.id, el); else cards.current.delete(entry.id); }} onClick={() => { lastCard.current = entry.id; setSelectedId(entry.id); }} aria-label={entry.info.name + 'の詳細'}>
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
