import { useUpdateDraft } from '../updateDraft.ts';
import { useRef, useState, useEffect } from 'react';
import type { Item } from '../../../shared/items.ts';
import { telephoneKind, TELEPHONE_MAX_POINTS, TELEPHONE_MAX_STROKES, type TelephoneAnswer, type TelephoneStroke } from '../../../shared/telephone.ts';
import { useStore, serverNow } from '../store.ts';
import { itemAction } from './actions.ts';

function Picture({ strokes, onDown, onMove, onUp }: {
  strokes: TelephoneStroke[];
  onDown?: React.PointerEventHandler<SVGSVGElement>;
  onMove?: React.PointerEventHandler<SVGSVGElement>;
  onUp?: React.PointerEventHandler<SVGSVGElement>;
}) {
  return <svg className="telephone-picture" viewBox="0 0 620 450" role="img" aria-label="伝言の絵"
    onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
    <rect width="620" height="450" fill="white" />
    {strokes.map((s, i) => s.pts.length === 2
      ? <circle key={i} cx={s.pts[0]} cy={s.pts[1]} r={s.size / 2} fill={s.color === 'erase' ? '#ffffff' : s.color} />
      : <polyline key={i} points={s.pts.join(' ')} fill="none" stroke={s.color === 'erase' ? '#ffffff' : s.color}
        strokeWidth={s.size} strokeLinecap="round" strokeLinejoin="round" />)}
  </svg>;
}
function Answer({ answer }: { answer: TelephoneAnswer }) {
  return answer.kind === 'text' ? <p className="telephone-text">{answer.text || '（空回答）'}</p> : <Picture strokes={answer.strokes} />;
}
function TelephoneTurn({ item, interactive }: { item: Extract<Item, { kind: 'telephone' }>; interactive: boolean }) {
  const g = item.game, assignment = g.assignment;
  const [text, setText] = useUpdateDraft(`telephone.text.${item.id}.${g.deadline}`, '');
  const [strokes, setStrokes] = useUpdateDraft<TelephoneStroke[]>(`telephone.strokes.${item.id}.${g.deadline}`, []);
  const [color, setColor] = useState('#111111');
  const [size, setSize] = useState(4);
  const pointer = useRef<number | null>(null);
  // 描画中の未反映の点列 (x, y の平坦配列) と、その反映を予約した rAF (#203)。
  // pointermove のたびに state を更新せず、フレームごとにまとめて足す。点そのものは落とさない。
  const pending = useRef<number[]>([]);
  const raf = useRef<number | null>(null);
  const [now, setNow] = useState(serverNow);
  useEffect(() => { const timer = setInterval(() => setNow(serverNow()), 250); return () => clearInterval(timer); }, []);
  useEffect(() => () => { if (raf.current !== null) cancelAnimationFrame(raf.current); }, []);
  const applyPending = () => {
    if (!pending.current.length) return;
    const pts = pending.current;
    pending.current = [];
    setStrokes(old => {
      if (!old.length) return old;
      const room = TELEPHONE_MAX_POINTS - old.reduce((n, s) => n + s.pts.length / 2, 0);
      if (room <= 0) return old;
      const add = pts.slice(0, room * 2);
      return old.map((s, i) => i === old.length - 1 ? { ...s, pts: [...s.pts, ...add] } : s);
    });
  };
  const flushPending = () => {
    if (raf.current !== null) { cancelAnimationFrame(raf.current); raf.current = null; }
    applyPending();
  };
  const locked = !interactive || !!assignment?.own || now >= (g.deadline ?? 0);
  const point = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return [Math.round(Math.max(0, Math.min(620, (e.clientX - r.left) * 620 / r.width))),
      Math.round(Math.max(0, Math.min(450, (e.clientY - r.top) * 450 / r.height)))];
  };
  const down: React.PointerEventHandler<SVGSVGElement> = e => {
    if (locked || pointer.current !== null || e.button !== 0) return;
    if (strokes.length >= TELEPHONE_MAX_STROKES || strokes.reduce((n, s) => n + s.pts.length / 2, 0) >= TELEPHONE_MAX_POINTS) return;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* VR の合成入力は端末側で保持する */ }
    pointer.current = e.pointerId;
    const pts = point(e);
    setStrokes(old => old.length >= TELEPHONE_MAX_STROKES || old.reduce((n, s) => n + s.pts.length / 2, 0) >= TELEPHONE_MAX_POINTS
      ? old : [...old, { color, size, pts }]);
  };
  const move: React.PointerEventHandler<SVGSVGElement> = e => {
    if (locked || pointer.current !== e.pointerId) return;
    pending.current.push(...point(e));
    if (raf.current === null) {
      raf.current = requestAnimationFrame(() => { raf.current = null; applyPending(); });
    }
  };
  const up: React.PointerEventHandler<SVGSVGElement> = e => {
    if (pointer.current !== e.pointerId) return;
    flushPending(); // 末尾の点を落とさないよう、指を離した時点で未反映分を確定させる
    pointer.current = null;
  };
  return <>
    <p role="timer">工程 {g.step + 1} / {g.participants.length}：{telephoneKind(g.step) === 'text' ? '文章' : '描画'}・残り {Math.max(0, Math.ceil(((g.deadline ?? 0) - now) / 1000))} 秒</p>
    <p>提出 {g.submitted.length} / {g.participants.length}</p>
    {!assignment ? <p>観覧中です。途中の参加登録は次回から反映されます。</p> : <>
      {assignment.previous && <section><b>直前の伝言</b><Answer answer={assignment.previous.answer} /></section>}
      {assignment.own ? <section><b>提出済み・ほかの人を待っています</b><Answer answer={assignment.own} /></section> : interactive && <>
        <p>{g.step === 0 ? '最初のお題を書いてください。' : telephoneKind(g.step) === 'text' ? '絵を文章で説明してください。' : '文章を絵にしてください。'}</p>
        {telephoneKind(g.step) === 'text'
          ? <textarea aria-label="伝言の文章" maxLength={1000} value={text} disabled={locked} onChange={e => setText(e.target.value)} />
          : <><div className="telephone-controls">
            <label>色 <select value={color} disabled={locked} onChange={e => setColor(e.target.value)}>
              {['#111111', '#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', 'erase'].map(c => <option key={c} value={c}>{c === 'erase' ? '消しゴム' : c}</option>)}
            </select></label>
            <label>太さ <select value={size} disabled={locked} onChange={e => setSize(Number(e.target.value))}>{[4, 10, 24].map(n => <option key={n}>{n}</option>)}</select></label>
            <button disabled={locked} onClick={() => setStrokes([])}>白紙に戻す</button>
          </div><Picture strokes={strokes} onDown={down} onMove={move} onUp={up} /></>}
        <button disabled={locked} onClick={() => itemAction(item.id, { a: 'telephoneSubmit', round: g.round, step: g.step,
          answer: telephoneKind(g.step) === 'text' ? { kind: 'text', text } : { kind: 'drawing', strokes } })}>提出する</button>
        <small>時間切れの未提出は空回答・白紙になります。{telephoneKind(g.step) === 'drawing' && `絵は${TELEPHONE_MAX_STROKES}本・${TELEPHONE_MAX_POINTS}点まで。`}</small>
      </>}
    </>}
  </>;
}
export function TelephoneBody({ item, interactive }: { item: Extract<Item, { kind: 'telephone' }>; interactive: boolean }) {
  const self = useStore(s => s.selfId), here = useStore(s => s.participants);
  const g = item.game, present = new Set(here.map(p => p.id));
  const registered = g.registered.some(p => p.id === self);
  const candidates = g.registered.filter(p => present.has(p.id));
  const hostPresent = candidates.some(p => p.id === g.host);
  const canStart = registered && present.has(self) && candidates.length >= 2 && candidates.length <= 30
    && g.phase !== 'playing' && (g.phase === 'lobby' || !hostPresent || g.host === self);
  const host = g.host === self && registered && present.has(self);
  const name = (id: string) => g.participants.find(p => p.id === id)?.name ?? g.registered.find(p => p.id === id)?.name ?? id;
  const result = g.results[g.page];
  return <div className="telephone-body">
    <p>{g.host ? `👑 ${name(g.host)}` : 'ホスト未定'}・在席登録者 {candidates.length} 人</p>
    {interactive && <div className="telephone-controls">
      <button onClick={() => itemAction(item.id, { a: 'telephoneRegister', registered: !registered })}>{registered ? '参加登録を解除' : '参加登録する'}</button>
      <button disabled={!canStart} onClick={() => itemAction(item.id, { a: 'telephoneStart' })}>{g.phase === 'lobby' ? '開始する' : '次のゲームを開始'}</button>
    </div>}
    {g.phase !== 'playing' && <p>在席している登録者2〜30人で開始できます。{g.phase === 'results' && '次回開始時に履歴をリセットします。'}</p>}
    <p>参加登録：{g.registered.map(p => `${p.name}${present.has(p.id) ? '' : '（不在）'}`).join('、') || 'なし'}</p>
    {g.participants.length > 0 && <p>今回の順序：{g.participants.map(p => `${p.id === g.host ? '👑 ' : ''}${p.name}${present.has(p.id) ? '' : '（不在）'}`).join(' → ')}</p>}
    {g.phase === 'playing' && <TelephoneTurn key={`${item.id}:${g.round}:${g.step}`} item={item} interactive={interactive} />}
    {g.phase === 'results' && <>
      <h3>結果鑑賞・公開 {g.revealed} / {g.participants.length ** 2}</h3>
      {interactive && host && <div className="telephone-controls">
        <button disabled={g.page <= 0} onClick={() => itemAction(item.id, { a: 'telephonePage', round: g.round, page: g.page - 1 })}>前へ</button>
        <button disabled={g.page + 1 >= g.revealed} onClick={() => itemAction(item.id, { a: 'telephonePage', round: g.round, page: g.page + 1 })}>次へ</button>
        <button disabled={g.revealed === g.participants.length ** 2} onClick={() => itemAction(item.id, { a: 'telephoneReveal', round: g.round })}>次の回答を公開</button>
      </div>}
      {result ? <section><p>チェーン {result.chain + 1}・工程 {result.step + 1}・{name(result.entry.by)}</p><Answer answer={result.entry.answer} /></section>
        : <p>ホストによる公開を待っています。</p>}
      <p>公開とページ移動はホストが操作し、全員に同期します。</p>
    </>}
  </div>;
}
