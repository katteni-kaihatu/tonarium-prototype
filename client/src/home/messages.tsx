import { useUpdateDraft } from '../updateDraft.ts';
import { useVoiceRecorder } from '../updateRecording.ts';
import { t as tr, systemText } from '../i18n/index.ts';
import { TranslatedText } from '../TranslatedText.tsx';
import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store.ts';
import { RSVP_LABEL } from '../i18n/static.ts';
import { PLAN_QUORUM, type Message, type Recap, type Rsvp } from '../../../shared/protocol.ts';
import { ITEM_INFO } from '../i18n/static.ts';
import { type ItemKind } from '../../../shared/items.ts';
import { WORLDS } from '../i18n/static.ts';
import { answerPlan, joinSession, markRead, sendMessage } from '../actions.ts';
import { uploadMedia } from '../media.ts';
import { ChatImage } from '../world/common.tsx';
import { Icon } from '../world/Icon.tsx';
import { openWindow } from '../world/windows.ts';
import { NameFace, timeLabel } from './common.tsx';

const NONE: Message[] = [];
const RSVPS = Object.keys(RSVP_LABEL) as Rsvp[];
const VOICE_MAX_SEC = 60;

function ItemTile({ kind, summary, image }: { kind: ItemKind; summary: string; image?: string }) {
  const info = ITEM_INFO[kind];
  if (image) return <img className="rtile img" src={image} alt={systemText(summary)} />;
  return (
    <span className="rtile" style={{ background: info.tint, color: info.ink }}>
      <span className="rmark">{info.mark}</span>
      <span className="rsum">{systemText(summary)}</span>
    </span>
  );
}

/** セッションに入って、そのアイテムのウィンドウを開く */
function continueWith(session: string, itemId: string | undefined) {
  joinSession(session);
  if (itemId) openWindow(`item:${itemId}`);
}

const CONTINUE_ORDER: ItemKind[] = ['chess', 'chessAi', 'g2048', 'canvas', 'note'];

function RecapCard({ r }: { r: Recap }) {
  const visible = useStore((s) => s.guild.sessions.some((d) => d.id === r.session));
  const world = useStore((s) => s.worldBy[r.session] ?? 'room');
  const [log, setLog] = useState(false);
  const target = CONTINUE_ORDER.map((k) => r.items.find((it) => it.kind === k)).find(Boolean);
  const min = Math.max(1, Math.round((r.to - r.from) / 60_000));
  const span = min >= 60 ? tr("ui232", Math.floor(min / 60), min % 60) : tr("ui233", min);
  return (
    <article className="recap" aria-label={tr("ui234")}>
      <div className="rhead" style={{ background: WORLD_TINT[world] }}>
        <Icon name="headset" size={14} />
        <b>{r.sessionName}{tr("ui235")}</b>
        <span className="spacer" />
        <span className="sub">{timeLabel(r.from)}〜{new Date(r.to).getHours()}:{String(new Date(r.to).getMinutes()).padStart(2, '0')}</span>
      </div>
      <div className="rbody">
        <div className="row">
          <span className="stack">{r.people.slice(0, 6).map((n) => <NameFace key={n} name={n} size={22} />)}</span>
          <span className="sub">{r.people.join(tr("ui236"))} · {span}</span>
        </div>
        {r.items.length > 0 && <div className="rtiles">{r.items.map((it) => <ItemTile key={it.id} kind={it.kind} summary={it.summary} image={it.image} />)}</div>}
        <div className="row wrap">
          {visible && (
            <button className="primary small" onClick={() => continueWith(r.session, target?.id)}>
              {target?.kind === 'chess' || target?.kind === 'chessAi' ? tr("ui237") : tr("ui238")}
            </button>
          )}
          {r.log.length > 0 && <button className="small" onClick={() => setLog(!log)}>{log ? tr("ui239") : tr("ui240", r.log.length)}</button>}
        </div>
        {log && (
          <div className="rlog">
            {r.log.map((l, i) => <div key={i}><b>{l.name}</b> <span className="sub">{timeLabel(l.at)}</span><div><TranslatedText text={l.text} /></div></div>)}
          </div>
        )}
      </div>
    </article>
  );
}

const WORLD_TINT: Record<string, string> = { room: '#DCE6F3', cafe: '#F3E6C6', game: '#E7DDF2', garden: '#DDEBCF', antimatter: '#D9D6F5' };

function PlanCard({ conv, m }: { conv: string; m: Message }) {
  const plan = m.plan!;
  const selfName = useStore((s) => s.selfName);
  const session = useStore((s) => s.guild.sessions.find((d) => d.id === plan.session));
  const mine = plan.answers[selfName];
  const count = (a: Rsvp) => Object.values(plan.answers).filter((x) => x === a).length;
  const yes = count('yes');
  return (
    <div className="plan">
      <div className="row">
        <Icon name="calendar" size={15} />
        <b>{timeLabel(plan.at)}{session ? ` · ${session.name}` : ''}</b>
        <span className="spacer" />
        {!plan.event && <span className="sub">{Math.max(0, PLAN_QUORUM - yes)} {tr("ui241")}</span>}
      </div>
      <div className="planbtns" role="group" aria-label={tr("ui88")}>
        {RSVPS.map((a) => (
          <button key={a} className={mine === a ? 'on' : ''} aria-pressed={mine === a} onClick={() => answerPlan(conv, m.id, mine === a ? null : a)}>
            {RSVP_LABEL[a]} {count(a)}
          </button>
        ))}
      </div>
      {plan.event && <span className="sub ok">{PLAN_QUORUM} {tr("ui242")}</span>}
    </div>
  );
}

function InviteCard({ sid }: { sid: string }) {
  const s = useStore((st) => st.guild.sessions.find((d) => d.id === sid));
  const world = useStore((st) => st.worldBy[sid] ?? s?.world ?? 'room');
  const n = useStore((st) => st.users.filter((u) => u.session === sid).length);
  if (!s) return <div className="refcard"><span className="sub">{tr("ui243")}</span></div>;
  return (
    <div className="refcard">
      <span className="refmark" style={{ background: WORLD_TINT[world] }}><Icon name="headset" size={16} /></span>
      <span className="finfo"><b>{s.name}</b><span className="sub">{WORLDS[world].name} · {n} {tr("ui125")}</span></span>
      <button className="primary small" onClick={() => joinSession(sid)}>{tr("ui194")}</button>
    </div>
  );
}

function ItemRefCard({ item }: { item: NonNullable<Message['item']> }) {
  const s = useStore((st) => st.guild.sessions.find((d) => d.id === item.session));
  const live = useStore((st) => st.sessionInfo[item.session]?.items.some((i) => i.id === item.id));
  const info = ITEM_INFO[item.kind];
  return (
    <div className="refcard">
      <span className="refmark" style={{ background: info.tint, color: info.ink }}>{info.mark}</span>
      <span className="finfo"><b>{systemText(item.summary)}</b><span className="sub">{s ? tr("ui244", s.name) : tr("ui245")}{s && !live && tr("ui246")}</span></span>
      {s && live && <button className="small" onClick={() => continueWith(item.session, item.id)}>{tr("ui238")}</button>}
    </div>
  );
}

export function MessageView({ conv, m }: { conv: string; m: Message }) {
  if (m.recap) return <div className="msg sys"><RecapCard r={m.recap} /></div>;
  return (
    <div className="msg">
      <NameFace name={m.from} size={32} />
      <div className="msgbody">
        <span className="mhead"><b>{m.from}</b><span className="sub">{timeLabel(m.at)}</span></span>
        {m.text && <p className="mtext"><TranslatedText text={m.text} /></p>}
        {m.voice && <audio className="mvoice" src={m.voice.url} controls preload="metadata" aria-label={tr("ui247", m.voice.sec)} />}
        {m.media?.kind === 'image' && <ChatImage src={m.media.url} />}
        {m.media?.kind === 'video' && <video className="chatvideo" src={m.media.url} controls preload="metadata" playsInline />}
        {m.plan && <PlanCard conv={conv} m={m} />}
        {m.invite && <InviteCard sid={m.invite} />}
        {m.item && <ItemRefCard item={m.item} />}
      </div>
    </div>
  );
}

/** 会話。開いている間は読んだことにし、開いた時点の未読の頭に線を引く */
export function Thread({ conv, empty }: { conv: string; empty: string }) {
  const list = useStore((s) => s.inbox[conv]) ?? NONE;
  const selfName = useStore((s) => s.selfName);
  const [since] = useState(() => useStore.getState().reads[conv] ?? 0);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
    markRead(conv);
  }, [conv, list.length]);
  const firstUnread = list.find((m) => m.at > since && m.from !== selfName)?.id;
  return (
    <div className="thread" ref={ref}>
      {list.length === 0 && <p className="hempty">{empty}</p>}
      {list.map((m) => (
        <div key={m.id}>
          {m.id === firstUnread && since > 0 && <div className="unreadline"><span>{tr("ui248")}</span></div>}
          <MessageView conv={conv} m={m} />
        </div>
      ))}
    </div>
  );
}

function defaultPlanAt() {
  const d = new Date(Date.now() + 86_400_000);
  d.setHours(21, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function Composer({ conv, placeholder, allowPlan, extra }: { conv: string; placeholder: string; allowPlan?: boolean; extra?: React.ReactNode }) {
  const sessions = useStore((s) => s.guild.sessions);
  const [text, setText] = useUpdateDraft(`message.${conv}`, '');
  const [plan, setPlan] = useUpdateDraft<{ at: string; session: string } | null>(`plan.${conv}`, null);
  const fileRef = useRef<HTMLInputElement>(null);
  const voice = useVoiceRecorder(conv);
  const planAt = plan ? new Date(plan.at).getTime() : NaN;
  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (plan) {
      if (!Number.isFinite(planAt)) return;
      sendMessage(conv, { text: text.trim(), plan: { at: planAt, session: plan.session || null } });
      setPlan(null);
    } else {
      if (!text.trim()) return;
      sendMessage(conv, { text });
    }
    setText('');
  };
  const attach = async (file: File | undefined) => {
    if (!file) return;
    const media = await uploadMedia(file);
    if (media) { sendMessage(conv, { text, media }); setText(''); }
  };
  return (
    <form className="mcomposer" onSubmit={submit}>
      {plan && (
        <div className="planform">
          <label className="hfield">{tr("ui115")}<input type="datetime-local" value={plan.at} onChange={(e) => setPlan({ ...plan, at: e.target.value })} /></label>
          <label className="hfield">{tr("ui249")}<select value={plan.session} onChange={(e) => setPlan({ ...plan, session: e.target.value })}>
              <option value="">{tr("ui64")}</option>
              {sessions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label>
          <span className="sub wrap">{PLAN_QUORUM} {tr("ui250")}</span>
        </div>
      )}
      <div className="mbar">
        <input ref={fileRef} type="file" accept="image/*,video/mp4,video/webm" hidden onChange={(e) => { void attach(e.target.files?.[0]); e.target.value = ''; }} />
        <label className="sr" htmlFor={`m-${conv}`}>{tr("ui181")}</label>
        <input
          id={`m-${conv}`} value={text} placeholder={voice.recording ? tr("ui251", voice.sec) : plan ? tr("ui252") : placeholder}
          disabled={voice.recording} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && e.nativeEvent.isComposing) e.preventDefault(); }}
        />
        {extra}
        {allowPlan && (
          <button type="button" className={`ib square ${plan ? 'on' : ''}`} aria-label={tr("ui253")} aria-pressed={!!plan} title={tr("ui254")} onClick={() => setPlan(plan ? null : { at: defaultPlanAt(), session: '' })}>
            <Icon name="calendar" size={17} />
          </button>
        )}
        <button type="button" className="ib square" aria-label={tr("ui255")} onClick={() => fileRef.current?.click()}><Icon name="attach" size={17} /></button>
        <button type="button" className={`ib square ${voice.recording ? 'rec' : ''}`} aria-label={voice.recording ? tr("ui256") : tr("ui257")} aria-pressed={voice.recording} onClick={voice.toggle}>
          <Icon name="mic" size={17} />
        </button>
        <button type="submit" className="primary square" aria-label={tr("ui258")} disabled={voice.recording}><Icon name="send" size={17} /></button>
      </div>
    </form>
  );
}
