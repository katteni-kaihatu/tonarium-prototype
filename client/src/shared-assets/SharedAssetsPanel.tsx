import { useEffect, useState } from 'react';
import { emptyMap, LIMITS, validateMap, type Catalog, type Placement, type SharedMap } from '../../../shared/shared-assets.ts';
import { send } from '../net/ws.ts';
import { useStore } from '../store.ts';
import { useSharedAssets } from './state.ts';
import { AssetLoader } from './loader.ts';
import './shared-assets.css';

export function SharedAssetsPanel() {
  const sid = useStore(s => s.session); const state = useSharedAssets();
  const [open, setOpen] = useState(false), [query, setQuery] = useState(''), [kind, setKind] = useState('all');
  const [draft, setDraft] = useState<SharedMap>(emptyMap), [text, setText] = useState(''), [notice, setNotice] = useState('');
  const [selected, setSelected] = useState(''); const [compatible, setCompatible] = useState(true);
  const [linkFrom, setLinkFrom] = useState(''), [linkOutput, setLinkOutput] = useState(''), [linkTo, setLinkTo] = useState(''), [linkInput, setLinkInput] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/shared-catalog', { signal: controller.signal }).then(r => { if (!r.ok) throw new Error('カタログを取得できません'); return r.json() as Promise<Catalog>; })
      .then(catalog => useSharedAssets.setState({ catalog })).catch(() => { if (!controller.signal.aborted) setNotice('カタログを取得できません。再度開いてください。'); });
    return () => controller.abort();
  }, [open]);
  useEffect(() => {
    if (!state.catalog) { setDraft(emptyMap()); return; }
    try { const saved = localStorage.getItem(`tonarium.shared-draft.${sid}`); const map: unknown = saved ? JSON.parse(saved) : emptyMap(); validateMap(map, state.catalog.entries); setDraft(map); } catch { setDraft(emptyMap()); setNotice('保存済みdraftを検証できません。JSONと原本の版を確認してください。'); }
    setSelected('');
  }, [sid, state.catalog]);
  useEffect(() => { if (state.sid === sid && state.view) setNotice(`確定revision: ${state.view.revision}`); }, [sid, state.sid, state.view?.revision]);
  const edit = (map: SharedMap) => { setDraft(map); try { localStorage.setItem(`tonarium.shared-draft.${sid}`, JSON.stringify(map)); } catch { setNotice('端末にdraftを保存できません。JSONを保存してください。'); } };
  const update = (p: Placement) => edit({ ...draft, placements: draft.placements.map(x => x.instanceId === p.instanceId ? p : x) });
  const catalog = state.catalog;
  const chosen = draft.placements.find(p => p.instanceId === selected);
  const entry = chosen ? catalog?.entries.find(e => e.id === chosen.asset.id && e.version === chosen.asset.version) : undefined;
  const manifestFor = (id: string) => { const placement = draft.placements.find(p => p.instanceId === id); return placement ? catalog?.entries.find(e => e.id === placement.asset.id && e.version === placement.asset.version && e.integrity === placement.asset.integrity)?.manifest : undefined; };
  const submit = () => {
    if (!catalog || !state.view || state.sid !== sid) return;
    try { validateMap(draft, catalog.entries); send({ t: 'sharedCommand', command: { kind: 'map', id: `c-${crypto.randomUUID()}`, revision: state.view.revision, map: draft } }); setNotice('確定応答を待っています'); } catch { setNotice('設定が契約に合いません。原本・接続・値域を確認してください。'); }
  };
  const test = async () => {
    if (!catalog) return; const loader = new AssetLoader();
    try { validateMap(draft, catalog.entries); const results = await Promise.allSettled(draft.placements.map(p => loader.load(p.asset.integrity))); setNotice(`原本検証: 成功 ${results.filter(r => r.status === 'fulfilled').length} / ${results.length}`); } catch { setNotice('マップ検証に失敗しました'); } finally { loader.dispose(); }
  };
  return <div className="shared-assets-control">
    <button className="chipbtn" onClick={() => setOpen(!open)}>共有アセット</button>
    {open && <section className="shared-assets-panel" aria-label="共有アセット編集">
      <header><h2>共有アセット</h2><button onClick={() => setOpen(false)} aria-label="閉じる">閉じる</button></header>
      <p>中央原本は読取専用。配置のdraftを端末に保存し、試験後にこの部屋へ適用します。</p>
      <label>マップID<input value={draft.id} onChange={e => edit({ ...draft, id: e.target.value })} /></label>
      <label>共有revision<input type="number" min="1" step="1" value={draft.revision} onChange={e => edit({ ...draft, revision: Number(e.target.value) })} /></label>
      <label>検索<input value={query} onChange={e => setQuery(e.target.value)} /></label>
      <label>種類<select value={kind} onChange={e => setKind(e.target.value)}><option value="all">すべて</option><option value="spatial">空間</option><option value="system">非空間システム</option></select></label>
      <label><input type="checkbox" checked={compatible} onChange={e => setCompatible(e.target.checked)} />対応SDKのみ</label>
      <ul>{catalog?.entries.filter(e => (kind === 'all' || e.manifest.kind === kind) && (!compatible || e.manifest.sdk === 'tonarium-rules/0.2') && `${e.id} ${e.manifest.title}`.toLowerCase().includes(query.toLowerCase())).map(e => <li key={`${e.id}@${e.version}`}><button disabled={draft.placements.length >= LIMITS.instances} onClick={() => {
        const instanceId = `i-${crypto.randomUUID()}`; edit({ ...draft, placements: [...draft.placements, { instanceId, asset: { id: e.id, version: e.version, integrity: e.integrity }, transform: { x: 0, y: 0, z: 0, ry: 0, scale: 1 }, config: {} }] }); setSelected(instanceId);
      }}>{e.manifest.title} {e.version} を追加</button></li>)}</ul>
      {!catalog?.entries.length && <p>公開済みの原本がありません。提出形式は docs/shared-assets.md を参照してください。</p>}
      <label>配置<select value={selected} onChange={e => setSelected(e.target.value)}><option value="">選択してください</option>{draft.placements.map(p => <option key={p.instanceId} value={p.instanceId}>{p.asset.id}: {p.instanceId}</option>)}</select></label>
      {chosen && <fieldset><legend>{chosen.asset.id} の配置と設定</legend>
        {(['x', 'y', 'z', 'ry', 'scale'] as const).map(k => <label key={k}>{k}<input type="number" step="0.1" value={chosen.transform[k]} onChange={e => update({ ...chosen, transform: { ...chosen.transform, [k]: Number(e.target.value) } })} /></label>)}
        {Object.entries(entry?.manifest.fields ?? {}).map(([name, field]) => <label key={name}>{name} ({field.scope})<input type="number" min={field.min} max={field.max} value={chosen.config[name] ?? field.initial} onChange={e => update({ ...chosen, config: { ...chosen.config, [name]: Number(e.target.value) } })} /></label>)}
        <button onClick={() => edit({ ...draft, placements: [...draft.placements, { ...structuredClone(chosen), instanceId: `i-${crypto.randomUUID()}` }] })}>複製</button>
        <button onClick={() => { edit({ ...draft, placements: draft.placements.filter(p => p.instanceId !== chosen.instanceId), connections: draft.connections.filter(c => c.from !== chosen.instanceId && c.to !== chosen.instanceId) }); setSelected(''); }}>削除</button>
      </fieldset>}
      <fieldset><legend>接続</legend>
        <label>送信元<select value={linkFrom} onChange={e => { setLinkFrom(e.target.value); setLinkOutput(''); }}><option value="">配置を選択</option>{draft.placements.map(p => <option key={p.instanceId} value={p.instanceId}>{p.instanceId}</option>)}</select></label>
        <label>出力<select value={linkOutput} onChange={e => setLinkOutput(e.target.value)}><option value="">出力を選択</option>{manifestFor(linkFrom)?.outputs.map(port => <option key={port}>{port}</option>)}</select></label>
        <label>接続先<select value={linkTo} onChange={e => { setLinkTo(e.target.value); setLinkInput(''); }}><option value="">配置を選択</option>{draft.placements.map(p => <option key={p.instanceId} value={p.instanceId}>{p.instanceId}</option>)}</select></label>
        <label>入力<select value={linkInput} onChange={e => setLinkInput(e.target.value)}><option value="">入力を選択</option>{manifestFor(linkTo)?.inputs.map(port => <option key={port}>{port}</option>)}</select></label>
        <button disabled={!linkFrom || !linkTo || !linkOutput || !linkInput} onClick={() => { const map = { ...draft, connections: [...draft.connections, { from: linkFrom, output: linkOutput, to: linkTo, input: linkInput }] }; try { validateMap(map, catalog?.entries ?? []); edit(map); } catch { setNotice('重複した接続、または互換性のないポートです。'); } }}>接続を追加</button>
        {draft.connections.map((c, index) => <p key={index}>{c.from}.{c.output} → {c.to}.{c.input} <button onClick={() => edit({ ...draft, connections: draft.connections.filter((_, i) => i !== index) })}>接続を削除</button></p>)}
      </fieldset>
      <div className="shared-assets-buttons"><button onClick={() => { if (state.view && state.sid === sid) edit(structuredClone(state.view.map)); }}>確定済みから読み込む</button><button onClick={() => void test()}>原本を試験</button><button onClick={submit}>部屋へ適用</button></div>
      <label>マップJSON<textarea value={text} onChange={e => setText(e.target.value)} maxLength={LIMITS.manifest} /></label>
      <div className="shared-assets-buttons"><button onClick={() => setText(JSON.stringify(draft, null, 2))}>JSON出力</button><button onClick={() => { try { const map: unknown = JSON.parse(text); validateMap(map, catalog?.entries ?? []); edit(map); } catch { setNotice('JSONを読み込めません。原本の版とintegrityも確認してください。'); } }}>JSON入力</button><button onClick={() => { const blob = new Blob([JSON.stringify(draft, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${draft.id}-${draft.revision}.json`; a.click(); URL.revokeObjectURL(url); setNotice('shared-maps/<id>/<revision>.json としてPRへ添付してください。PR作成はこの画面では実行しません。'); }}>共有用JSONを保存</button></div>
      <p role="status">{state.error || notice}</p>
      <h3>この部屋の状態</h3>
      {state.sid === sid && state.view?.map.placements.map(p => { const manifest = catalog?.entries.find(e => e.id === p.asset.id && e.version === p.asset.version)?.manifest; return <div key={p.instanceId}><b>{manifest?.title ?? p.asset.id}</b><output> {JSON.stringify(state.view?.values[p.instanceId])} </output>{manifest?.inputs.map(event => <button key={event} onClick={() => send({ t: 'sharedCommand', command: { kind: 'events', id: `c-${crypto.randomUUID()}`, revision: state.view!.revision, events: [{ instanceId: p.instanceId, event }] } })}>{event}</button>)}</div>; })}
    </section>}
  </div>;
}
