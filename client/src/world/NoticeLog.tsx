import { useUpdateDraft } from '../updateDraft.ts';
import { sourceText as uiSource } from '../i18n/core.ts';
import { TranslatedText } from '../TranslatedText.tsx';
import { localized, t as tr, systemText } from '../i18n/index.ts';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ChatMessage, ChatScope } from '../../../shared/protocol.ts';
import { VOICE_RANGE } from '../../../shared/places.ts';
import { DICE_COLORS, diceLabel, type DiceRoll } from '../../../shared/dice.ts';
import { useStore, set, save, colorOf, isBroadcast, type Notice } from '../store.ts';
import { followUser, goNear, invite, joinGroup, joinSession, markNoticesRead, poke, removeNotice, sendChat, setViewLive } from '../actions.ts';
import { dmKey } from '../../../shared/protocol.ts';
import { SessionMessages, useMessageUnread } from './SessionMessages.tsx';
import { Icon } from './Icon.tsx';
import { ChatImage, Face, itemLabel } from './common.tsx';
import { openWindow } from './windows.ts';
import { canItemize, itemizeMessage, uploadMedia } from '../media.ts';
import { OgpCard, firstUrl } from './Links.tsx';

const NO_CHAT: ChatMessage[] = [];
const time = (at: number) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const SCOPES: { scope: ChatScope; label: string; title: string; placeholder: string }[] = localized([
  { scope: 'near', label: uiSource('ui630'), title: uiSource('ui631', VOICE_RANGE), placeholder: uiSource('ui631', VOICE_RANGE) },
  { scope: 'all', label: uiSource('ui632'), title: uiSource('ui633'), placeholder: uiSource('ui633') },
  { scope: 'announce', label: uiSource('ui634'), title: uiSource('ui635'), placeholder: uiSource('ui636') },
]);

function useVisibleChat() {
  const chat = useStore((s) => (s.session ? s.chats[s.session] ?? NO_CHAT : NO_CHAT));
  const blocked = useStore((s) => s.blocked);
  return chat.filter((m) => !(m.from && blocked.includes(m.from)));
}

const NOTICE_TEXT: Record<Exclude<Notice['kind'], 'hit'>, string> = localized({
  poke: uiSource('ui637'),
  follow: uiSource('followNotice'),
  live: uiSource('ui640'),
  attention: uiSource('ui641'),
  invite: uiSource('ui642'),
  askJoin: uiSource('ui643'),
  online: uiSource('ui176'),
});

/** 招待の通知が指しているセッションかグループ */
export function inviteTarget(s: { guild: { sessions: { id: string; name: string }[] }; groups: { id: string; name: string }[] }, n: Notice) {
  if (n.kind !== 'invite' || !n.key) return undefined;
  const id = n.key.slice(n.key.indexOf(':') + 1);
  return n.key.startsWith('group:') ? s.groups.find((g) => g.id === id) : s.guild.sessions.find((d) => d.id === id);
}
export function acceptInvite(n: Notice) {
  const id = n.key!.slice(n.key!.indexOf(':') + 1);
  if (n.key!.startsWith('group:')) joinGroup(id); else joinSession(id);
  removeNotice(n.id);
}

function NoticeRow({ n, onMessage }: { n: Notice; onMessage: (conv: string) => void }) {
  const selfId = useStore((s) => s.selfId);
  const target = useStore((s) => (n.key ? s.items[n.key.slice(n.key.indexOf(':') + 1)] : undefined));
  const inviteTo = useStore((s) => inviteTarget(s, n));
  const followingBack = useStore((s) => s.following.includes(n.from));
  const text = n.kind === 'attention' ? (target ? tr("ui644", itemLabel(target)) : tr("ui645"))
    : n.kind === 'hit' ? tr('ui638', n.count ?? 1)
    : n.kind === 'invite' ? tr("ui177", inviteTo ? `「${inviteTo.name}」` : tr("ui178")) : NOTICE_TEXT[n.kind];
  const reply = n.kind === 'askJoin'
    ? <button className="ib reply" onClick={() => { invite('session', n.key!.slice(8), n.from); removeNotice(n.id); }}>{tr("ui646")}</button>
    : n.kind === 'online'
    ? <button className="ib reply" onClick={() => { onMessage(dmKey(selfId, n.from)); removeNotice(n.id); }}>{tr("ui181")}</button>
    : n.kind === 'invite'
    ? <button className="ib reply" disabled={!inviteTo} onClick={() => acceptInvite(n)}>{n.key?.startsWith('group:') ? tr("ui146") : tr("ui194")}</button>
    : n.kind === 'attention'
    ? <button className="ib reply" disabled={!target} onClick={() => n.key && openWindow(n.key)}>{tr("ui598")}</button>
    : n.kind === 'poke'
    ? <button className="ib reply" onClick={() => poke(n.from)}>{tr("ui647")}</button>
    : n.kind === 'hit'
      ? <button className="ib reply" onClick={() => goNear(n.from)}>{tr("ui611")}</button>
      : n.kind === 'live'
        ? <button className="ib reply" onClick={() => setViewLive(true, n.id)}>{tr("ui648")}</button>
        : followingBack ? null : <button className="ib reply" onClick={() => { followUser(n.from, true); removeNotice(n.id); }}>{tr('followBack')}</button>;
  return (
    <div className={`notice ${n.unread ? 'unread' : ''}`}>
      <Face id={n.from} name={n.fromName} size={28} />
      <div className="ntext">
        <span><b>{n.fromName}</b>{text}</span>
        <span className="sub">{time(n.at)}</span>
      </div>
      {n.unread && <span className="unreaddot" aria-label={tr("ui649")} />}
      {reply}
    </div>
  );
}

function Composer() {
  const session = useStore(s => s.session);
  const [text, setText] = useUpdateDraft(`chat.${session}`, '');
  const [scope, setScope] = useUpdateDraft<ChatScope>(`chatScope.${session}`, 'near');
  const fileRef = useRef<HTMLInputElement>(null);
  const cur = SCOPES.find((x) => x.scope === scope)!;
  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!text.trim()) return;
    sendChat(text, scope);
    setText('');
  };
  const broadcast = useStore((s) => isBroadcast(s));
  const placeholder = scope === 'near' && broadcast ? tr("ui650") : cur.placeholder;
  const attach = async (file: File | undefined) => {
    if (!file) return;
    const media = await uploadMedia(file);
    if (!media) return;
    sendChat(text, scope, undefined, media);
    setText('');
  };
  return (
    <>
      <div className="scopes" role="radiogroup" aria-label={tr("ui651")}>
        {SCOPES.map((x) => (
          <button
            key={x.scope} role="radio" aria-checked={scope === x.scope} title={x.title}
            className={`scope ${scope === x.scope ? 'on' : 'ib'}`} onClick={() => setScope(x.scope)}
          >
            {x.scope === 'announce' ? <Icon name="megaphone" size={13} /> : <span className={`dot ${x.scope}`} />}
            {x.label}
          </button>
        ))}
      </div>
      <form className="composer" onSubmit={submit}>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { void attach(e.target.files?.[0]); e.target.value = ''; }} />
        <button type="button" className="ib square" aria-label={tr("ui255")} title={tr("ui652")} onClick={() => fileRef.current?.click()}><Icon name="attach" size={18} /></button>
        <label htmlFor="chatinput" className="sr">{tr("ui181")}</label>
        <input
          id="chatinput" value={text} placeholder={placeholder} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && e.nativeEvent.isComposing) e.preventDefault(); }}
        />
        <button type="submit" className="primary square" aria-label={tr("ui258")}><Icon name="send" size={18} /></button>
      </form>
    </>
  );
}

function DiceLine({ roll }: { roll: DiceRoll }) {
  const c = DICE_COLORS[roll.sides];
  if (!roll.results) return <span className="logdice">{tr("ui653")}{diceLabel(roll.sides, roll.count)} {tr("ui565")}</span>;
  return (
    <span className="logdice">
      🎲 {diceLabel(roll.sides, roll.count)}{roll.secret && tr("ui654")}：
      {roll.results.map((v, i) => <span key={i} className="lnum" style={{ background: c.bg, color: c.ink }}>{v}</span>)}
      {roll.results.length > 1 && <>＝ <b>{roll.results.reduce((a, b) => a + b, 0)}</b></>}
    </span>
  );
}

function LogLine({ m, selfId }: { m: ChatMessage; selfId: string }) {
  if (m.from === null) return <div className={`logevent ${m.about === selfId ? 'hi' : ''}`}>{systemText(m.text)}</div>;
  return (
    <div className={`logchat ${m.scope}`}>
      <Face id={m.from} name={m.fromName} size={22} />
      <div className="lbody">
        <div className="lwho">
          <b style={{ color: colorOf(m.from) }}>{m.fromName}</b>
          {m.scope === 'all' && <span className="scopebadge all">{tr("ui632")}</span>}
          {m.scope === 'announce' && <span className="scopebadge announce">{tr("ui634")}</span>}
          <span className="sub">{time(m.at)}</span>
        </div>
        {m.dice && <DiceLine roll={m.dice} />}
        {m.text && <span className="ltext"><TranslatedText text={m.text} /></span>}
        {firstUrl(m.text) && <OgpCard url={firstUrl(m.text)!} />}
        <ChatImage src={m.image} />
        {m.media?.kind === 'image' && <ChatImage src={m.media.url} />}
        {canItemize(m) && (
          <button className="ib itemize" onClick={() => void itemizeMessage(m)} title={tr("ui655")}>
            <Icon name="box" size={12} />{tr("ui656")}</button>
        )}
      </div>
    </div>
  );
}

export function NoticeLog() {
  const folded = useStore((s) => s.folded.right);
  const notices = useStore((s) => s.notices);
  const selfId = useStore((s) => s.selfId);
  const chat = useVisibleChat();
  const [tab, setTab] = useState<'all' | 'chat'>('all');
  const view = useStore((s) => s.rightView);
  const setView = (rightView: 'log' | 'msg') => set({ rightView });
  const conv = useStore((s) => s.rightConversation);
  const setConv = (rightConversation: string | null) => set({ rightConversation });
  const msgUnread = useMessageUnread();
  const openMessage = (c: string) => { setConv(c); setView('msg'); };
  const listRef = useRef<HTMLDivElement>(null);
  const announce = [...chat].reverse().find((m) => m.scope === 'announce');
  const unread = notices.filter((n) => n.unread).length;
  const logs = tab === 'chat' ? chat.filter((m) => m.from !== null) : chat;
  // 一番下を見ているときだけ新しいログに追従する。開き直したら一番下から
  const stick = useRef(true);
  const toBottom = () => { const el = listRef.current; if (el && stick.current) el.scrollTop = el.scrollHeight; };
  const onLogScroll = () => { const el = listRef.current; if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24; };
  useLayoutEffect(() => { stick.current = true; }, [tab, folded, view]);
  useLayoutEffect(toBottom, [logs[logs.length - 1]?.id, tab, folded, view]);
  useEffect(() => {
    // 画像や OGP カードは後から高さが変わる。load は泡立たないので捕捉で拾う
    const el = listRef.current;
    if (!el) return;
    const mo = new MutationObserver(toBottom);
    mo.observe(el, { childList: true, subtree: true });
    el.addEventListener('load', toBottom, true);
    return () => { mo.disconnect(); el.removeEventListener('load', toBottom, true); };
  }, [folded, view]);
  const fold = (right: boolean) => set((s) => { const f = { ...s.folded, right }; save('tonarium.folded', f); return { folded: f }; });

  if (folded) {
    return (
      <button className="foldedpanel right" onClick={() => fold(false)} aria-label={tr("ui657")}>
        <Icon name="left" size={14} stroke={2.4} />
        <span className="fp bell"><Icon name="bell" size={18} />{unread > 0 && <span className="badge">{unread}</span>}</span>
        <span className="fpline" />
        <span className="fp bell"><Icon name="chat" size={18} />{msgUnread > 0 && <span className="badge">{msgUnread}</span>}</span>
      </button>
    );
  }
  const tabs = (
    <div className="ptabs" role="tablist" aria-label={tr("ui658")}>
      <button role="tab" aria-selected={view === 'log'} className={`ib ptab ${view === 'log' ? 'on' : ''}`} onClick={() => setView('log')}>{tr("ui659")}{unread > 0 && <span className="badge">{unread}</span>}</button>
      <button role="tab" aria-selected={view === 'msg'} className={`ib ptab ${view === 'msg' ? 'on' : ''}`} onClick={() => setView('msg')}>{tr("ui181")}{msgUnread > 0 && <span className="badge">{msgUnread}</span>}</button>
      <button className="ib" onClick={() => fold(true)} aria-label={tr("ui627")}><Icon name="right" size={15} /></button>
    </div>
  );
  if (view === 'msg') {
    return (
      <aside className="panel noticelog" aria-label={tr("ui181")}>
        {tabs}
        <SessionMessages open={conv} onOpen={setConv} />
      </aside>
    );
  }
  return (
    <aside className="panel noticelog" aria-label={tr("ui660")}>
      {tabs}
      <div className="phead">
        <h2>{tr("ui183")}</h2>
        {unread > 0 && <span className="badge">{unread}</span>}
        <span className="spacer" />
        <button className="ib small" onClick={markNoticesRead} disabled={!unread}>{tr("ui661")}</button>
      </div>
      <div className="notices">
        {announce && (
          <div className="announce">
            <span className="aicon"><Icon name="megaphone" /></span>
            <div>
              <div className="ahead"><strong>{tr("ui634")}</strong>{announce.fromName} · {time(announce.at)}</div>
              <span><TranslatedText text={announce.text} /></span>
            </div>
          </div>
        )}
        {notices.map((n) => <NoticeRow key={n.id} n={n} onMessage={openMessage} />)}
        {!announce && !notices.length && <div className="empty">{tr("ui662")}</div>}
      </div>
      <div className="psplit" aria-hidden="true"><span /></div>
      <div className="phead">
        <h2>{tr("ui663")}</h2>
        <span className="spacer" />
        <button className={`tab ${tab === 'all' ? 'on' : 'ib'}`} onClick={() => setTab('all')}>{tr("ui281")}</button>
        <button className={`tab ${tab === 'chat' ? 'on' : 'ib'}`} onClick={() => setTab('chat')}>{tr("ui664")}</button>
      </div>
      <div className="logs" ref={listRef} onScroll={onLogScroll}>
        {logs.map((m) => <LogLine key={m.id} m={m} selfId={selfId} />)}
      </div>
      <Composer />
    </aside>
  );
}
