import { t as tr } from '../i18n/index.ts';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { get, nameOf, set, useStore } from '../store.ts';
import { useUpdateDraft } from '../updateDraft.ts';
import { usePhone } from '../phone.ts';
import { ITEM_INFO, WORLDS } from '../i18n/static.ts';
import { WORLD_KINDS } from '../../../shared/worlds.ts';
import { MARKET_PRODUCTS, contentAvailable } from '../../../shared/market.ts';
import type { ItemKind } from '../../../shared/items.ts';
import type { Mode } from '../../../shared/protocol.ts';
import { POST_MAX_CHARS, REACTIONS, TIMELINE_TABS, threadOf, timelineEntries, type Post, type PostAttach, type TimelineEntry, type TimelineTab } from '../../../shared/timeline.ts';
import { joinSession } from '../actions.ts';
import { spawnItem } from '../items/actions.ts';
import { useOwnedItems } from '../market/items.ts';
import { useOwnedContent } from '../market/store.ts';
import { Icon, type IconName } from '../world/Icon.tsx';
import { CreateSessionDialog } from './dialogs.tsx';
import { Empty, PersonFace, PersonName, match, toggleFollow } from './common.tsx';
import { goHome, WORLD_FACE } from './pages.tsx';
import { agoLabel, closeTimelineSide, createPost, deletePost, offerPostImage, openCompose, openPost, postImageUrl, reactPost, repostPost, setTimelineTab, uploadPostImage } from '../timeline.ts';

const TAB_ICON: Record<TimelineTab, IconName> = { home: 'home', session: 'door', social: 'people', global: 'globe' };
const TAB_LABEL: Record<TimelineTab, string> = { home: 'tlTabHome', session: 'tlTabSession', social: 'tlTabSocial', global: 'tlTabGlobal' };
const TAB_DESC: Record<TimelineTab, string> = { home: 'tlTabHomeDesc', session: 'tlTabSessionDesc', social: 'tlTabSocialDesc', global: 'tlTabGlobalDesc' };

/** 外を押すかスクロールしたら閉じる小さなメニュー */
function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const pop = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (t: EventTarget | null) => !ref.current?.contains(t as Node) && !pop.current?.contains(t as Node);
    const onDown = (e: MouseEvent) => { if (outside(e.target)) setOpen(false); };
    // 画面に固定して出すので、下の一覧が動いたら閉じてずれたまま残さない
    const onScroll = (e: Event) => { if (outside(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('scroll', onScroll, true);
    return () => { document.removeEventListener('mousedown', onDown); window.removeEventListener('scroll', onScroll, true); };
  }, [open]);
  return { open, setOpen, ref, pop };
}

/** 一覧や右の欄のスクロール領域で切れないよう、body に出してボタンの位置に合わせる */
function Popover({ p, className = '', label, children }: { p: ReturnType<typeof usePopover>; className?: string; label?: string; children: React.ReactNode }) {
  const r = p.ref.current?.getBoundingClientRect();
  if (!p.open || !r) return null;
  const style: React.CSSProperties = { right: Math.max(8, innerWidth - r.right) };
  if (innerHeight - r.bottom < 220) style.bottom = innerHeight - r.top + 4; else style.top = r.bottom + 4;
  return createPortal(<span ref={p.pop} className={`tlpop ${className}`} style={style} role="menu" aria-label={label}>{children}</span>, document.body);
}

/** 返信の数。カードごとに全ポストを数え直さないよう、ポストの配列ごとに 1 回だけ数える */
const replyCounts = new WeakMap<Post[], Map<string, number>>();
function replyCountOf(posts: Post[], id: string) {
  let map = replyCounts.get(posts);
  if (!map) {
    map = new Map();
    for (const x of posts) if (x.replyTo) map.set(x.replyTo, (map.get(x.replyTo) ?? 0) + 1);
    replyCounts.set(posts, map);
  }
  return map.get(id) ?? 0;
}

/** セッションの外ではセッションのタブを出さない */
function useTabs() {
  const inSession = useStore((s) => !!s.session);
  const tab = useStore((s) => s.timelineTab);
  const tabs = TIMELINE_TABS.filter((t) => t !== 'session' || inSession);
  return { tabs, tab: tabs.includes(tab) ? tab : 'home' as TimelineTab };
}

export function TimelineTabs() {
  const { tabs, tab } = useTabs();
  return (
    <div className="tltabs" role="tablist" aria-label={tr('tlTitle')}>
      {tabs.map((t) => (
        <button key={t} role="tab" aria-selected={t === tab} title={tr(TAB_DESC[t])} className={t === tab ? 'on' : ''} onClick={() => setTimelineTab(t)}>
          <Icon name={TAB_ICON[t]} size={15} />{tr(TAB_LABEL[t])}
        </button>
      ))}
    </div>
  );
}

function useEntries(q: string) {
  const { tab } = useTabs();
  const posts = useStore((s) => s.posts);
  const self = useStore((s) => s.selfId);
  const following = useStore((s) => s.following);
  const friends = useStore((s) => s.friends);
  const fof = useStore((s) => s.fof);
  const blocked = useStore((s) => s.blocked);
  const participants = useStore((s) => s.participants);
  const users = useStore((s) => s.users);
  const directory = useStore((s) => s.directory);
  const here = participants.map((u) => u.id);
  const name = (id: string | undefined) => (id ? nameOf(id, { users, directory }) : undefined);
  return timelineEntries(posts, tab, { self, following, friends, fof, here, blocked })
    .filter((e) => match(q, e.post.text, name(e.post.author), name(e.repostBy)));
}

/** 書く欄以外の入力欄（検索・返信）に貼った物は横取りしない */
const isOtherField = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.tagName === 'INPUT' || (t.tagName === 'TEXTAREA' && !t.closest('.tlcompose')) || t.isContentEditable);

/** ページのどこに貼っても・落としても、写真を書く欄に付ける。セッション中はワールド側が受け取らないようにしてある */
function usePhotoInput() {
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    let depth = 0;
    const onPaste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.files ?? [])];
      if (!files.length || isOtherField(e.target)) return;
      e.preventDefault();
      offerPostImage(files);
    };
    const wanted = (e: DragEvent) => !!e.dataTransfer?.types.includes('Files');
    const onEnter = (e: DragEvent) => { if (wanted(e)) { depth++; setDragging(true); } };
    const onLeave = () => { depth = Math.max(0, depth - 1); if (!depth) setDragging(false); };
    const onOver = (e: DragEvent) => { if (wanted(e)) e.preventDefault(); };
    const onDrop = (e: DragEvent) => {
      depth = 0;
      setDragging(false);
      const files = [...(e.dataTransfer?.files ?? [])];
      if (!files.length) return;
      e.preventDefault();
      offerPostImage(files);
    };
    window.addEventListener('paste', onPaste);
    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('dragover', onOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('paste', onPaste);
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('drop', onDrop);
    };
  }, []);
  return dragging;
}

export function TimelinePage({ q }: { q: string }) {
  const { tab } = useTabs();
  const dragging = usePhotoInput();
  const entries = useEntries(q);
  const session = useStore((s) => s.guild.sessions.find((d) => d.id === s.session));
  const here = useStore((s) => s.participants.length);
  // 「◯分前」を開いたまま古くしない
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);
  return (
    <section className="tlpage" aria-label={tr('tlTitle')}>
      {tab === 'session' && session && <div className="tlbanner"><Icon name="door" size={15} />{tr('tlSessionBanner', session.name, here)}</div>}
      {entries.length === 0
        ? <Empty>{q ? tr('ui223') : tr(tab === 'home' ? 'tlEmptyHome' : 'tlEmpty')}</Empty>
        : <div className="tllist">{entries.map((e) => <PostCard key={e.post.id} entry={e} />)}</div>}
      <button className="tlfab" aria-label={tr('tlWrite')} onClick={() => openCompose()}><Icon name="pen" size={20} />{tr('tlPostShort')}</button>
      {dragging && (
        <div className="drophint" aria-hidden="true">
          <div><Icon name="image" size={36} stroke={1.6} /><b>{tr('tlDropPhoto')}</b><span>{tr('tlDropPhotoSub')}</span></div>
        </div>
      )}
    </section>
  );
}

function PlaceTag({ sid, name, mode, suffix }: { sid: string; name: string | null; mode: Mode; suffix?: string }) {
  const visible = useStore((s) => s.guild.sessions.find((d) => d.id === sid)?.name);
  return (
    <span className="tlplace">
      <Icon name="pin" size={12} />{visible ?? name ?? tr('tlPrivateSession')}{suffix}<span className="dim">·</span>
      <span className="tlmode" title={tr(mode === '3d' ? 'tlIn3d' : 'tlIn2d')}><Icon name={mode === '3d' ? 'cube' : 'flat'} size={12} /></span>{mode.toUpperCase()}
    </span>
  );
}

function Head({ p, small }: { p: Post; small?: boolean }) {
  return (
    <div className="tlhead">
      <b><PersonName id={p.author} /></b><span className="sub">{agoLabel(p.at)}</span>
      <span className="spacer" />
      {!small && p.place && <PlaceTag {...p.place} />}
    </div>
  );
}

function SessionAttach({ a }: { a: Extract<PostAttach, { kind: 'session' }> }) {
  const def = useStore((s) => s.guild.sessions.find((d) => d.id === a.id));
  const world = useStore((s) => (def ? s.worldBy[def.id] ?? def.world ?? 'room' : 'room'));
  const users = useStore((s) => s.users);
  const here = users.filter((u) => u.session === a.id);
  const friends = useStore((s) => s.friends);
  const current = useStore((s) => s.session === a.id);
  const nf = here.filter((u) => friends.includes(u.id)).length;
  return (
    <div className="tlattach">
      <span className="tlthumb" style={{ background: WORLD_FACE[world] }}><Icon name="headset" size={18} /></span>
      <span className="finfo">
        <span className="tlkind">{tr('ui119')}</span>
        <b>{def?.name ?? a.name ?? tr('tlPrivateSession')}</b>
        <span className="sub">
          {here.length > 0 && <span className="tlfaces">{here.slice(0, 4).map((u) => <PersonFace key={u.id} id={u.id} size={16} />)}</span>}
          {def ? `${here.length} ${tr('ui125')}${nf ? tr('ui195', nf) : ''}` : tr('tlSessionGone')}
        </span>
      </span>
      {current ? <span className="hhere small"><i />{tr('ui192')}</span> : def && <button className="tlbtn" onClick={() => joinSession(def.id)}>{tr('ui194')}</button>}
    </div>
  );
}

function WorldAttach({ id }: { id: Extract<PostAttach, { kind: 'world' }>['id'] }) {
  const [create, setCreate] = useState(false);
  const owned = useOwnedContent();
  return (
    <div className="tlattach">
      <span className="tlthumb" style={{ background: WORLD_FACE[id] }}><Icon name="globe" size={18} /></span>
      <span className="finfo"><span className="tlkind">{tr('ui105')}</span><b>{WORLDS[id].name}</b><span className="sub">{WORLDS[id].desc}</span></span>
      {contentAvailable(owned, 'worlds', id) && <button className="tlbtn" onClick={() => setCreate(true)}>{tr('ui101')}</button>}
      {create && createPortal(<CreateSessionDialog world={id} onClose={() => setCreate(false)} />, document.body)}
    </div>
  );
}

function itemOf(id: string) {
  const product = MARKET_PRODUCTS.find((p) => p.id === id);
  if (product?.category === 'items') {
    const base = ITEM_INFO[product.kind ?? 'note'];
    return { name: product.name, genre: base.genre, creator: product.creator, mark: product.mark, tint: product.color, ink: product.ink };
  }
  const info = Object.hasOwn(ITEM_INFO, id) ? ITEM_INFO[id as ItemKind] : null;
  return info && { name: info.name, genre: info.genre, creator: 'Tonarium', mark: info.mark, tint: info.tint, ink: info.ink };
}

function ItemAttach({ id }: { id: string }) {
  const inSession = useStore((s) => !!s.session);
  const mine = useOwnedItems().find((e) => e.id === id);
  const info = itemOf(id);
  if (!info) return null;
  const use = () => { if (inSession && mine) { spawnItem(mine.kind, mine.text, undefined, mine.variant); set({ hubOpen: false }); } else goHome(mine ? 'items' : 'market'); };
  return (
    <div className="tlattach">
      <span className="tlthumb" style={{ background: info.tint, color: info.ink, fontWeight: 800, fontSize: info.mark.length > 2 ? 11 : 16 }}>{info.mark}</span>
      <span className="finfo"><span className="tlkind">{tr('ui154')}</span><b>{info.name}</b><span className="sub">{info.genre} · {info.creator}</span></span>
      <button className="tlbtn" onClick={use}>{inSession && mine ? tr('tlSpawn') : tr('tlSeeItem')}</button>
    </div>
  );
}

function Attach({ a }: { a: PostAttach }) {
  if (a.kind === 'session') return <SessionAttach a={a} />;
  if (a.kind === 'world') return <WorldAttach id={a.id} />;
  return <ItemAttach id={a.id} />;
}

function QuoteBox({ id }: { id: string }) {
  const p = useStore((s) => s.posts.find((x) => x.id === id));
  if (!p) return <div className="tlquote sub">{tr('tlQuoteGone')}</div>;
  return (
    <button className="tlquote" onClick={() => openPost(p.id)}>
      <span className="tlqhead"><PersonFace id={p.author} size={16} /><b><PersonName id={p.author} /></b><span className="sub">{agoLabel(p.at)}</span></span>
      {p.text && <span className="tlqtext">{p.text}</span>}
      {(p.image || p.attach) && <span className="sub">{p.image ? tr('tlWithPhoto') : tr('tlWithAttach')}</span>}
    </button>
  );
}

function Media({ p }: { p: Post }) {
  if (!p.image && !p.attach && !p.quote) return null;
  return (
    <div className="tlmedia">
      {p.image && (
        <button className="tlphoto" onClick={() => set({ lightbox: postImageUrl(p.image!) })}>
          <img src={postImageUrl(p.image)} alt={tr('tlPhotoAlt', nameOf(p.author))} loading="lazy" />
          {p.place && <span className="tlshot"><Icon name="camera" size={12} /><PlaceTag {...p.place} suffix={tr('tlShotAt')} /></span>}
        </button>
      )}
      {p.attach && <Attach a={p.attach} />}
      {p.quote && <QuoteBox id={p.quote} />}
    </div>
  );
}

function ReactionChips({ p }: { p: Post }) {
  const self = useStore((s) => s.selfId);
  const names = (ids: string[]) => ids.map((id) => nameOf(id)).join(', ');
  return (
    <>
      {Object.entries(p.reactions).map(([emoji, ids]) => {
        const on = ids.includes(self);
        return (
          <button key={emoji} className={`tlrx ${on ? 'on' : ''}`} aria-pressed={on} title={names(ids)} onClick={() => reactPost(p.id, emoji, !on)}>
            <span>{emoji}</span><b>{ids.length}</b>
          </button>
        );
      })}
    </>
  );
}

function ReactButton({ p, small }: { p: Post; small?: boolean }) {
  const self = useStore((s) => s.selfId);
  const pop = usePopover();
  return (
    <span className="tlpopwrap" ref={pop.ref}>
      <button className={`ib tlact ${small ? 'small' : ''}`} aria-label={tr('tlReact')} title={tr('tlReact')} aria-expanded={pop.open} onClick={() => pop.setOpen(!pop.open)}><Icon name="emote" size={15} /></button>
      <Popover p={pop} className="tlemojis" label={tr('tlReact')}>
        {REACTIONS.map((e) => {
          const on = !!p.reactions[e]?.includes(self);
          return <button key={e} role="menuitemcheckbox" aria-checked={on} className={`ib ${on ? 'on' : ''}`} onClick={() => { reactPost(p.id, e, !on); pop.setOpen(false); }}>{e}</button>;
        })}
      </Popover>
    </span>
  );
}

function RepostButton({ p, small }: { p: Post; small?: boolean }) {
  const self = useStore((s) => s.selfId);
  const pop = usePopover();
  const mine = p.reposts.some((r) => r.id === self);
  if (p.replyTo) return null;
  return (
    <span className="tlpopwrap" ref={pop.ref}>
      <button className={`ib tlact ${small ? 'small' : ''} ${mine ? 'reposted' : ''}`} aria-label={tr('tlRepost')} title={tr('tlRepost')} aria-expanded={pop.open} onClick={() => pop.setOpen(!pop.open)}>
        <Icon name="repost" size={15} />{p.reposts.length > 0 && p.reposts.length}
      </button>
      <Popover p={pop} label={tr('tlRepost')}>
        <button role="menuitem" className="ib" onClick={() => { repostPost(p.id, !mine); pop.setOpen(false); }}><Icon name="repost" size={15} />{mine ? tr('tlUndoRepost') : tr('tlRepost')}</button>
        <button role="menuitem" className="ib" onClick={() => { openCompose(p.id); pop.setOpen(false); }}><Icon name="pen" size={15} />{tr('tlQuote')}</button>
      </Popover>
    </span>
  );
}

function MoreButton({ p, small }: { p: Post; small?: boolean }) {
  const self = useStore((s) => s.selfId);
  const following = useStore((s) => s.following.includes(p.author));
  const pop = usePopover();
  return (
    <span className="tlpopwrap" ref={pop.ref}>
      <button className={`ib tlact ${small ? 'small' : ''}`} aria-label={tr('tlMore')} title={tr('tlMore')} aria-expanded={pop.open} onClick={() => pop.setOpen(!pop.open)}><Icon name="more" size={15} /></button>
      <Popover p={pop} label={tr('tlMore')}>
        {p.author === self
          ? <button role="menuitem" className="ib danger" onClick={() => { if (confirm(tr('tlDeleteConfirm'))) deletePost(p.id); pop.setOpen(false); }}><Icon name="trash" size={15} />{tr('tlDelete')}</button>
          : <button role="menuitem" className="ib" onClick={() => { pop.setOpen(false); toggleFollow(p.author, !following); }}><Icon name="user" size={15} />{following ? tr('followUnfollow', nameOf(p.author)) : tr('followDo', nameOf(p.author))}</button>}
      </Popover>
    </span>
  );
}

function Actions({ p, small }: { p: Post; small?: boolean }) {
  const replies = replyCountOf(useStore((s) => s.posts), p.id);
  return (
    <div className="tlacts">
      {!small && <ReactionChips p={p} />}
      <span className="spacer" />
      <button className={`ib tlact ${small ? 'small' : ''}`} aria-label={tr('tlReply')} title={tr('tlReply')} onClick={() => openPost(p.replyTo ? rootOf(p) : p.id)}>
        <Icon name="reply" size={15} />{replies > 0 && replies}
      </button>
      <RepostButton p={p} small={small} />
      <ReactButton p={p} small={small} />
      <MoreButton p={p} small={small} />
    </div>
  );
}

function rootOf(p: Post) {
  const posts = get().posts;
  let cur = p;
  for (let i = 0; i < 50 && cur.replyTo; i++) {
    const up = posts.find((x) => x.id === cur.replyTo);
    if (!up) break;
    cur = up;
  }
  return cur.id;
}

function PostCard({ entry, detail }: { entry: TimelineEntry; detail?: boolean }) {
  const p = entry.post;
  const selected = useStore((s) => s.timelineSide === `post:${p.id}`);
  return (
    <article className={`tlpost ${selected && !detail ? 'sel' : ''}`}>
      {!detail && <button className="tlopen" aria-label={tr('tlOpenPost', nameOf(p.author))} onClick={() => openPost(p.id)} />}
      {entry.repostBy && <div className="tlrepostby"><Icon name="repost" size={13} />{tr('tlRepostedBy', nameOf(entry.repostBy))}</div>}
      <div className="tlrow">
        <PersonFace id={p.author} size={34} />
        <div className="tlbody">
          <Head p={p} small={detail} />
          {detail && p.place && <PlaceTag {...p.place} />}
          {p.text && <p className="tltext">{p.text}</p>}
          <Media p={p} />
          <Actions p={p} />
        </div>
      </div>
    </article>
  );
}

function ReplyRow({ p, depth, last, onReply }: { p: Post; depth: number; last: boolean; onReply: () => void }) {
  return (
    <div className="tlreply" style={{ marginLeft: Math.min(depth, 3) * 20 }}>
      {!last && <span className="tlline" aria-hidden="true" />}
      <PersonFace id={p.author} size={28} />
      <div className="tlbody">
        <span className="tlhead"><b><PersonName id={p.author} /></b><span className="sub">{agoLabel(p.at)}</span></span>
        {p.text && <span className="tltext small">{p.text}</span>}
        <Media p={p} />
        <div className="tlacts small">
          <ReactionChips p={p} /><span className="spacer" />
          <button className="ib tlact small" aria-label={tr('tlReply')} title={tr('tlReply')} onClick={onReply}><Icon name="reply" size={15} /></button>
          <ReactButton p={p} small /><MoreButton p={p} small />
        </div>
      </div>
    </div>
  );
}

function PostDetail({ id }: { id: string }) {
  const p = useStore((s) => s.posts.find((x) => x.id === id));
  const posts = useStore((s) => s.posts);
  const blocked = useStore((s) => s.blocked);
  const [text, setText] = useUpdateDraft(`timeline.reply.${id}`, '');
  const [to, setTo] = useState<Post | null>(null);
  const input = useRef<HTMLInputElement>(null);
  if (!p) return null;
  const thread = threadOf(posts, p.id).filter((r) => !blocked.includes(r.post.author));
  const target = to && posts.some((x) => x.id === to.id) ? to : p;
  const send = () => {
    if (!text.trim()) return;
    createPost({ text: text.trim(), withPlace: false, replyTo: target.id });
    setText('');
    setTo(null);
  };
  return (
    <div className="tlside">
      <div className="tlsidehead"><span>{tr('tlPost')}</span><button className="ib tlclose" aria-label={tr('tlCloseDetail')} onClick={closeTimelineSide}><Icon name="close" size={16} /></button></div>
      <div className="tlsidebody">
        <div className="tllist"><PostCard entry={{ post: p, at: p.at }} detail /></div>
        <span className="tlcount">{tr('tlReplies', thread.length)}</span>
        {thread.length === 0
          ? <Empty>{tr('tlNoReplies')}</Empty>
          : <div className="tlthread">{thread.map((r, i) => <ReplyRow key={r.post.id} p={r.post} depth={r.depth} last={(thread[i + 1]?.depth ?? -1) <= r.depth} onReply={() => { setTo(r.post); input.current?.focus(); }} />)}</div>}
      </div>
      <form className="tlreplybox" onSubmit={(e) => { e.preventDefault(); send(); }}>
        {target !== p && <button type="button" className="ib tlact small" aria-label={tr('tlReplyToRoot')} title={tr('tlReplyToRoot')} onClick={() => setTo(null)}><Icon name="close" size={12} /></button>}
        <input ref={input} aria-label={tr('tlWriteReply')} placeholder={tr('tlReplyTo', nameOf(target.author))} value={text} maxLength={POST_MAX_CHARS} onChange={(e) => setText(e.target.value)} />
        <button className="primary" disabled={!text.trim()}>{tr('tlReply')}</button>
      </form>
    </div>
  );
}

type Picker = 'session' | 'world' | 'item' | 'emoji' | null;

/** ゲストは見るだけ。書く欄の代わりにログインを案内する */
function Composer() {
  const guest = useStore((s) => s.selfGuest);
  if (guest) return <div className="tlside"><div className="tlsidehead"><span>{tr('tlWrite')}</span><button className="ib tlclose" aria-label={tr('tlCloseDetail')} onClick={closeTimelineSide}><Icon name="close" size={16} /></button></div><Empty>{tr('authLoginRequired')}</Empty></div>;
  return <ComposerForm />;
}

function ComposerForm() {
  const self = useStore((s) => s.selfName);
  const selfId = useStore((s) => s.selfId);
  const quote = useStore((s) => s.composeQuote);
  const session = useStore((s) => s.guild.sessions.find((d) => d.id === s.session));
  const mode = useStore((s) => s.mode);
  const sessions = useStore((s) => s.guild.sessions);
  const owned = useOwnedContent();
  const items = useOwnedItems();
  const [text, setText] = useUpdateDraft('timeline.compose', '');
  const [withPlace, setWithPlace] = useState(true);
  const [image, setImage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [attach, setAttach] = useState<PostAttach | null>(null);
  const [picker, setPicker] = useState<Picker>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const can = !uploading && (!!text.trim() || !!image || !!attach || !!quote);
  const pick = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const id = await uploadPostImage(file);
      if (id) setImage(id); else setError(tr('tlPhotoFailed'));
    } catch { setError(tr('tlPhotoFailed')); }
    setUploading(false);
  };
  const incoming = useStore((s) => s.composeImage);
  useEffect(() => {
    if (!incoming) return;
    set({ composeImage: null });
    if (incoming === 'unsupported') setError(tr('tlPhotoOnly'));
    else void pick(incoming);
  }, [incoming]);
  const insert = (emoji: string) => {
    const el = area.current;
    const at = el ? el.selectionStart : text.length;
    setText((text.slice(0, at) + emoji + text.slice(at)).slice(0, POST_MAX_CHARS));
    setPicker(null);
  };
  const submit = () => {
    if (!can) return;
    createPost({ text: text.trim(), withPlace: !!session && withPlace, image: image ?? undefined, attach: attach ?? undefined, quote: quote ?? undefined });
    setText('');
    setImage(null);
    setAttach(null);
    setPicker(null);
    set({ composeQuote: null });
  };
  const ATTACH: { id: Exclude<Picker, null> | 'photo'; icon: IconName; label: string }[] = [
    { id: 'photo', icon: 'camera', label: tr('tlPhoto') },
    { id: 'session', icon: 'headset', label: tr('ui119') },
    { id: 'world', icon: 'globe', label: tr('ui105') },
    { id: 'item', icon: 'box', label: tr('ui154') },
    { id: 'emoji', icon: 'emote', label: tr('tlEmoji') },
  ];
  return (
    <div className="tlside">
      <div className="tlsidehead"><span>{quote ? tr('tlQuoteWrite') : tr('tlWrite')}</span><button className="ib tlclose" aria-label={tr('tlCloseDetail')} onClick={closeTimelineSide}><Icon name="close" size={16} /></button></div>
      <div className="tlsidebody">
        <div className="tlcompose">
          <div className="tlwho"><PersonFace id={selfId} size={30} /><b>{self}</b><span className="spacer" /><span className="tlpublic" title={tr('tlPublicDesc')}><Icon name="globe" size={12} />{tr('tlPublic')}</span></div>
          <textarea ref={area} aria-label={tr('tlContent')} placeholder={tr('tlPlaceholder')} rows={6} value={text} maxLength={POST_MAX_CHARS} onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit(); }} />
          {image && (
            <span className="tlpreview"><img src={postImageUrl(image)} alt={tr('tlPhotoAlt', self)} /><button className="ib" aria-label={tr('tlRemovePhoto')} onClick={() => setImage(null)}><Icon name="close" size={14} /></button></span>
          )}
          {attach && <span className="tlattached"><Attach a={attach} /><button className="ib" aria-label={tr('tlRemoveAttach')} onClick={() => setAttach(null)}><Icon name="close" size={14} /></button></span>}
          {quote && <QuoteBox id={quote} />}
          {session && withPlace && (
            <span className="tlctx"><Icon name="pin" size={12} />{tr('tlFrom', session.name)} · <Icon name={mode === '3d' ? 'cube' : 'flat'} size={12} />{mode.toUpperCase()}
              <button className="ib" aria-label={tr('tlNoPlace')} onClick={() => setWithPlace(false)}><Icon name="close" size={12} /></button>
            </span>
          )}
          {session && !withPlace && <button className="ib tladdctx" onClick={() => setWithPlace(true)}><Icon name="pin" size={12} />{tr('tlAddPlace')}</button>}
          <div className="tlcounter">{text.length} / {POST_MAX_CHARS}</div>
        </div>
        <div className="tlattachbar">
          <span className="tlkind dim">{tr('tlAttach')}</span>
          <div className="tlgrid">
            {ATTACH.map((a) => (
              <button key={a.id} className={`ib ${picker === a.id ? 'on' : ''}`} title={a.label} aria-label={a.label} aria-pressed={a.id === 'photo' ? undefined : picker === a.id}
                disabled={a.id === 'photo' && uploading}
                onClick={() => (a.id === 'photo' ? fileRef.current?.click() : setPicker(picker === a.id ? null : a.id))}>
                <Icon name={a.icon} size={18} />{a.id === 'photo' && uploading ? tr('tlUploading') : a.label}
              </button>
            ))}
          </div>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ''; }} />
          {error && <span className="sub err">{error}</span>}
          {picker === 'emoji' && <div className="tlpicker tlemojis">{REACTIONS.map((e) => <button key={e} className="ib" onClick={() => insert(e)}>{e}</button>)}</div>}
          {picker === 'session' && (
            <div className="tlpicker">
              {sessions.length === 0 && <Empty>{tr('ui191')}</Empty>}
              {sessions.map((d) => <button key={d.id} className="ib" onClick={() => { setAttach({ kind: 'session', id: d.id, name: null }); setPicker(null); }}><Icon name="headset" size={14} />{d.name}</button>)}
            </div>
          )}
          {picker === 'world' && (
            <div className="tlpicker">
              {WORLD_KINDS.filter((k) => contentAvailable(owned, 'worlds', k)).map((k) => <button key={k} className="ib" onClick={() => { setAttach({ kind: 'world', id: k }); setPicker(null); }}><Icon name="globe" size={14} />{WORLDS[k].name}</button>)}
            </div>
          )}
          {picker === 'item' && (
            <div className="tlpicker">
              {items.map((it) => <button key={it.id} className="ib" onClick={() => { setAttach({ kind: 'item', id: it.id }); setPicker(null); }}><Icon name="box" size={14} />{it.info.name}</button>)}
            </div>
          )}
        </div>
        <span className="spacer" />
      </div>
      <button className="primary tlsubmit" disabled={!can} onClick={submit}>{tr('tlSubmit')}</button>
    </div>
  );
}

/** タイムラインの右の欄。null なら通常の右の欄を出す（呼び出し側） */
export function TimelineSide() {
  const side = useStore((s) => s.timelineSide);
  if (side === 'compose') return <Composer />;
  if (side?.startsWith('post:')) return <PostDetail key={side} id={side.slice(5)} />;
  return null;
}

/** スマホでは右の欄が無いので、書く・詳細を下から出す */
export function TimelinePhoneSheet() {
  const phone = usePhone();
  const side = useStore((s) => s.timelineSide);
  if (!phone || !side) return null;
  return createPortal(
    <div className="modalbg tlsheetbg" onClick={closeTimelineSide}>
      <div className="tlsheet" role="dialog" aria-modal="true" aria-label={tr('tlTitle')} onClick={(e) => e.stopPropagation()}><TimelineSide /></div>
    </div>,
    document.body,
  );
}
