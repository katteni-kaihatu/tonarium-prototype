import { t as tr, msg } from '../i18n/index.ts';
import { useState } from 'react';
import { showToast, unreadOf, useStore } from '../store.ts';
import { channelKey, dmKey } from '../../../shared/protocol.ts';
import { sendMessage } from '../actions.ts';
import { Composer, Thread } from '../home/messages.tsx';
import { NameFace } from '../home/common.tsx';
import { GroupAvatar } from '../home/GroupAvatar.tsx';
import { Icon } from './Icon.tsx';
import { itemLabel } from './common.tsx';

interface Conv { key: string; title: string; mark: React.ReactNode }

/** 自分が入っている会話（DM はフレンド全員、チャンネルは所属グループの分） */
function useConvs(): Conv[] {
  const friends = useStore((s) => s.friends);
  const groups = useStore((s) => s.groups);
  const selfName = useStore((s) => s.selfName);
  const inbox = useStore((s) => s.inbox);
  const list: Conv[] = [
    ...groups.filter((g) => g.members.includes(selfName)).flatMap((g) => g.channels.map((c) => ({
      key: channelKey(g.id, c.id), title: `${g.name} #${c.name}`,
      mark: <GroupAvatar group={g} size="tiny" />,
    }))),
    ...friends.map((n) => ({ key: dmKey(selfName, n), title: n, mark: <NameFace name={n} size={26} /> })),
  ];
  const last = (c: string) => inbox[c]?.at(-1)?.at ?? 0;
  return list.sort((a, b) => last(b.key) - last(a.key));
}

function ShareItem({ conv, onDone }: { conv: string; onDone: () => void }) {
  const items = useStore((s) => s.items);
  const sid = useStore((s) => s.session);
  const list = Object.values(items).filter((it) => it.kind !== 'hammer' && it.kind !== 'camera');
  return (
    <div className="mpick">
      {list.length === 0 && <span className="sub">{tr("ui692")}</span>}
      {list.map((it) => (
        <button key={it.id} className="ib hpick" onClick={() => { if (sid) sendMessage(conv, { text: '', item: { session: sid, id: it.id } }); onDone(); }}>{itemLabel(it)}</button>
      ))}
    </div>
  );
}

function ConvView({ conv, title, onBack }: { conv: string; title: string; onBack: () => void }) {
  const sid = useStore((s) => s.session);
  const sessionName = useStore((s) => s.guild.sessions.find((d) => d.id === s.session)?.name);
  const [picking, setPicking] = useState(false);
  const callHere = () => {
    if (!sid) return;
    sendMessage(conv, { text: '', invite: sid });
    showToast(msg("ui693", sessionName ?? msg("ui694")));
  };
  return (
    <>
      <div className="phead">
        <button className="ib" aria-label={tr("ui695")} onClick={onBack}><Icon name="left" size={15} /></button>
        <h2 className="ellipsis">{title}</h2>
        <span className="spacer" />
        <button className="ib small" title={tr("ui696")} onClick={callHere}>{tr("ui697")}</button>
      </div>
      <Thread key={conv} conv={conv} empty={tr("ui698")} />
      {picking && <ShareItem conv={conv} onDone={() => setPicking(false)} />}
      <Composer
        conv={conv} placeholder={tr("ui699")} allowPlan={conv.startsWith('ch:')}
        extra={<button type="button" className={`ib square ${picking ? 'on' : ''}`} aria-label={tr("ui700")} aria-pressed={picking} onClick={() => setPicking(!picking)}><Icon name="box" size={17} /></button>}
      />
    </>
  );
}

/** 右パネルのメッセージ。セッションの外のやりとりに、声や 3D を離れずに返す */
export function SessionMessages({ open, onOpen }: { open: string | null; onOpen: (conv: string | null) => void }) {
  const convs = useConvs();
  const inbox = useStore((st) => st.inbox);
  const reads = useStore((st) => st.reads);
  const selfName = useStore((st) => st.selfName);
  const s = { inbox, reads, selfName };
  const cur = convs.find((c) => c.key === open);
  if (cur) return <ConvView conv={cur.key} title={cur.title} onBack={() => onOpen(null)} />;
  return (
    <div className="convlist">
      <p className="sub wrap convhint">{tr("ui701")}</p>
      {convs.length === 0 && <p className="empty">{tr("ui702")}</p>}
      {convs.map((c) => {
        const n = unreadOf(s, c.key);
        const last = s.inbox[c.key]?.at(-1);
        const preview = last ? (last.recap ? tr("ui234") : last.voice ? tr("ui703") : last.plan ? tr("ui704", last.text) : last.invite ? tr("ui705") : last.item ? last.item.summary : last.text) : '';
        return (
          <button key={c.key} className={`ib convrow ${n ? 'unread' : ''}`} onClick={() => onOpen(c.key)}>
            {c.mark}
            <span className="finfo"><b>{c.title}</b>{preview && <span className="sub">{last && last.from && !c.key.startsWith('dm:') ? `${last.from}：` : ''}{preview}</span>}</span>
            {n > 0 && <span className="badge">{n}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** 右パネルのタブに出す未読の合計 */
export function useMessageUnread() {
  const inbox = useStore((st) => st.inbox);
  const reads = useStore((st) => st.reads);
  const selfName = useStore((st) => st.selfName);
  return Object.keys(inbox).reduce((n, c) => n + unreadOf({ inbox, reads, selfName }, c), 0);
}
