import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { setMode, switchMode } from '../actions.ts';
import { get, set, useStore } from '../store.ts';
import { openWindow } from '../world/windows.ts';
import { itemLabel } from '../world/common.tsx';
import { Icon } from '../world/Icon.tsx';
import { PANELS } from '../items/panels.ts';
import { worldKindOf } from '../store.ts';
import { DEFAULT_TURN, turnSettings, unicodeCharacter } from './input.ts';
import { writeField, type TextField } from './domInput.ts';
import { endVR, resetXRInput, startVR, useXR, xr, xrPatch } from './runtime.ts';
import './xr.css';

export function XRLaunch() {
  const state = useXR();
  const session = useStore(s => s.session);
  const mode = useStore(s => s.mode);
  const [support, setSupport] = useState('WebXRを確認中');
  const [supported, setSupported] = useState(false);
  const electron = /Electron\//.test(navigator.userAgent);
  useEffect(() => {
    let alive = true;
    if (electron) { setSupport('Electron版はVR非対応です。WebXR対応の単体ブラウザで開いてください。'); return; }
    if (!isSecureContext || !navigator.xr) { setSupport('VR非対応: HTTPSとWebXR対応の単体ブラウザが必要です。ElectronはVR動作保証の対象外です。'); return; }
    void navigator.xr.isSessionSupported('immersive-vr').then(ok => {
      if (alive) { setSupported(ok); setSupport(ok ? 'Quest 3 / Steam Frame: ブラウザのWebXR対応が必要です。実機未検証。' : 'このブラウザではVRを利用できません。通常の2D・3Dは利用できます。'); }
    }).catch(() => { if (alive) setSupport('WebXRの確認に失敗しました。通常の画面をご利用ください。'); });
    return () => { alive = false; };
  }, [electron]);
  return <button type="button" disabled={!session || !supported || state.pending} title={!session ? 'セッションに入ってからVRを準備してください。' : support}
    aria-label={state.active ? 'VRを終了' : mode === '3d' && state.ready ? 'VRを開始' : 'VRを準備'} onClick={() => {
      if (state.active) void endVR();
      else if (mode !== '3d') setMode('3d');
      else void startVR();
    }}><Icon name="vr" size={14} />{electron ? 'VR（Electron非対応）' : state.active ? 'VR終了' : mode === '3d' && state.ready ? 'VR開始' : 'VR'}</button>;
}

export function XRSettings() {
  const [value, setValue] = useState(xr.settings);
  const update = (patch: Partial<typeof DEFAULT_TURN>) => {
    xr.settings = turnSettings({ ...value, ...patch }); setValue(xr.settings);
    try { localStorage.setItem('tonarium.xr.turn', JSON.stringify(xr.settings)); } catch { /* 保存不可でもその場で反映する */ }
  };
  return <fieldset className="xr-settings"><legend>VRの旋回</legend>
    <label>方式 <select value={value.mode} onChange={e => update({ mode: e.target.value as typeof value.mode })}><option value="snap">スナップターン</option><option value="smooth">スムースターン</option></select></label>
    <label>速度 {value.speed}°/秒 <input aria-label="VR旋回速度" type="range" min="15" max="180" step="15" value={value.speed} onChange={e => update({ speed: Number(e.target.value) })} /></label>
    <label>角度 {value.angle}° <input aria-label="VR旋回角度" type="range" min="15" max="90" step="15" value={value.angle} onChange={e => update({ angle: Number(e.target.value) })} /></label>
  </fieldset>;
}

const LETTERS = '1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ.,!?@:/_-+=#%()[]';
const KANA = 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをんぁぃぅぇぉゃゅょっー、。゛゜';
const KEY_COMMANDS = [['Space', 'ジャンプ / 上昇'], ['ShiftLeft', '下降'], ['KeyE', '乗降 / 右リーン'], ['KeyQ', '道具を置く / 左リーン'], ['KeyX', '片付け'], ['KeyL', 'カメラ配信'], ['KeyC', 'カメラ撮影'], ['KeyT', '一人称 / 三人称'], ['Tab', '左右パネル'], ['Escape', '閉じる'], ['ArrowUp', '↑'], ['ArrowDown', '↓'], ['ArrowLeft', '←'], ['ArrowRight', '→']] as const;
export function XRControls() {
  const state = useXR();
  const session = useStore(s => s.session);
  const mode = useStore(s => s.mode);
  const items = useStore(s => s.items);
  const participants = useStore(s => s.participants);
  const camFeeds = useStore(s => s.camFeeds);
  const sharer = useStore(s => s.sharer);
  const world = useStore(s => worldKindOf(s));
  const field = useRef<TextField | null>(null);
  const [editing, setEditing] = useState(false);
  const [selection, setSelection] = useState<HTMLSelectElement | null>(null);
  const [kana, setKana] = useState(false);
  const [hex, setHex] = useState('');
  const [commands, setCommands] = useState(false);
  const [middle, setMiddle] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  useEffect(() => {
    if (!state.active) return;
    const focus = (event: FocusEvent) => {
      if (event.target instanceof HTMLInputElement && !['checkbox', 'radio', 'range', 'file', 'button', 'submit'].includes(event.target.type) || event.target instanceof HTMLTextAreaElement) {
        field.current = event.target as TextField; setEditing(true);
        setDraft(event.target instanceof HTMLInputElement && ['date', 'time', 'datetime-local', 'color'].includes(event.target.type) ? event.target.value : null);
      }
      if (event.target instanceof HTMLSelectElement) setSelection(event.target);
    };
    const click = (event: MouseEvent) => { if (event.target instanceof HTMLSelectElement) setSelection(event.target); };
    document.addEventListener('focusin', focus);
    document.addEventListener('click', click);
    return () => { document.removeEventListener('focusin', focus); document.removeEventListener('click', click); field.current = null; setEditing(false); setSelection(null); setMiddle(false); setDraft(null); };
  }, [state.active]);
  useEffect(() => { if (state.active && (!session || mode !== '3d')) void endVR(); }, [session, mode, state.active]);
  useEffect(() => () => { if (xr.session) void endVR(); }, []);
  const key = (code: string, down: boolean) => {
    const key = code.startsWith('Arrow') ? code : code === 'Space' ? ' ' : code.replace(/^Key/, '').toLowerCase();
    window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key, bubbles: true }));
  };
  const type = (text: string, backspace = false) => {
    if (draft !== null) setDraft(backspace ? Array.from(draft).slice(0, -1).join('') : draft + text);
    else if (field.current) writeField(field.current, text, backspace);
  };
  if (!state.active) return state.error ? createPortal(<div className="xr-error" role="status">{state.error}<button onClick={() => xrPatch({ error: '' })}>閉じる</button></div>, document.body) : null;
  const candidates = [
    ...(world === 'antimatter' ? [{ key: 'antimatter', title: 'AD研究所' }, { key: 'antimatter-space', title: 'AD空間設定' }] : []),
    ...(world === 'survivors' ? [{ key: 'survivors', title: 'サバイバー' }, { key: 'survivor-library', title: 'サバイバー図鑑' }] : []),
    ...(sharer ? [{ key: 'share', title: '画面共有' }] : []),
    ...participants.map(p => ({ key: `face:${p.id}`, title: `顔: ${p.name}` })),
    ...Object.values(items).filter(item => PANELS[item.kind] || ['image', 'video', 'youtube', 'note', 'dice', 'telephone', 'antimatter', 'bike'].includes(item.kind) || item.mapPlacement?.mode === 'system')
      .map(item => ({ key: `item:${item.id}`, title: itemLabel(item) })),
    ...Object.keys(camFeeds).map(id => ({ key: id.startsWith('view:') ? id : `cam:${id}`, title: id.startsWith('view:') ? '視点配信' : 'カメラ配信' })),
  ];
  return createPortal(<div className={`xr-tools ${state.open ? '' : 'folded'}`}>
    <div className="xr-wrist" data-xr-surface="wrist" data-xr-utility="true" data-xr-title="左腕のパネル一覧">
      <h2>パネル一覧</h2><p>トリガーで開閉。グリップを押したままパネルを配置。</p>
      <button onClick={() => { xrPatch({ open: true }); set({ hubOpen: true }); }}>ホーム・クライアントモード</button>
      <button onClick={() => { xrPatch({ open: true }); set(s => ({ folded: { ...s.folded, left: false, right: false } })); }}>近くの一覧・チャットを用意</button>
      {candidates.map(entry => {
        const panel = state.panels.find(p => p.id === entry.key);
        return <button key={entry.key} aria-pressed={panel?.open ?? false} onClick={() => {
          xrPatch({ open: true });
          if (panel) xr.togglePanel?.(entry.key); else openWindow(entry.key);
        }}>{panel?.open ? '閉じる' : '開く'} · {entry.title}</button>;
      })}
      {state.panels.filter(p => !candidates.some(c => c.key === p.id)).map(panel => <button key={panel.id} aria-pressed={panel.open} onClick={() => { xrPatch({ open: true }); xr.togglePanel?.(panel.id); }}>{panel.open ? '閉じる' : '開く'} · {panel.title}</button>)}
    </div>
    <div className="xr-toolbar" data-xr-surface="tools" data-xr-utility="true" data-xr-title="VR操作">
      <button onClick={() => { resetXRInput(true); xrPatch({ open: !state.open }); }}>仮想端末を{state.open ? '閉じる' : '開く'} (B/Y)</button>
      <button onClick={() => void endVR()}>VR終了</button>
      <button onClick={() => void endVR()}>ファイル・外部画面をブラウザで操作</button>
      <button onClick={() => { void endVR().then(() => { if (get().session) switchMode('2d'); }); }}>2Dへ戻る</button>
      <button onClick={() => setCommands(!commands)}>操作キー</button><button onClick={() => { field.current?.focus(); setEditing(!editing); }}>文字入力</button>
    </div>
    <>
      <p data-xr-surface="help" data-xr-utility="true" data-xr-title="操作説明">左スティック: 移動 / 右: 旋回 / トリガー: レイ選択・ドラッグ / グリップ: 運ぶ（再押下で置く）、パネル上では押したまま配置 / A・X: ジャンプ / B・Y: 端末開閉。パネルを指して右スティックでスクロール。</p>
      {commands && <div className="xr-command-panel" data-xr-surface="commands" data-xr-utility="true" data-xr-title="操作キー"><XRSettings />
        {KEY_COMMANDS.map(([code, label]) => <button key={code} onPointerDown={e => { e.preventDefault(); key(code, true); }} onPointerUp={() => key(code, false)} onPointerCancel={() => key(code, false)} onPointerLeave={() => key(code, false)}>{label}</button>)}
        <button aria-pressed={middle} onClick={() => { setMiddle(!middle); document.body.dataset.xrMiddle = String(!middle); }}>地図ドラッグ: {middle ? '移動' : '通常'}</button>
        <button onClick={() => document.querySelector('.view3d canvas')?.dispatchEvent(new WheelEvent('wheel', { deltaY: -1 }))}>三人称を近く</button>
        <button onClick={() => document.querySelector('.view3d canvas')?.dispatchEvent(new WheelEvent('wheel', { deltaY: 1 }))}>三人称を遠く</button>
        <button onClick={() => { resetXRInput(); document.body.dataset.xrMiddle = 'false'; setMiddle(false); }}>入力を解除</button>
      </div>}
      {selection?.isConnected && <div className="xr-options" data-xr-surface="options" data-xr-utility="true" data-xr-title="選択肢" role="listbox">{Array.from(selection.options).map((option, i) => <button key={i} disabled={option.disabled} onClick={() => {
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(selection, option.value);
        selection.dispatchEvent(new Event('change', { bubbles: true })); setSelection(null);
      }}>{option.text}</button>)}<button onClick={() => setSelection(null)}>閉じる</button></div>}
      {editing && <div className="xr-keyboard" data-xr-surface="keyboard" data-xr-utility="true" data-xr-title="文字入力" onPointerDown={e => e.preventDefault()}>
        <span>{field.current?.isConnected ? `入力先: ${field.current.getAttribute('aria-label') || field.current.placeholder || field.current.type}` : '入力欄をレイで選択してください'}</span>
        <button onClick={() => setKana(!kana)}>{kana ? '英数' : 'かな'}</button>
        {draft !== null && <span>編集: {draft}<button onClick={() => setDraft('')}>消去</button><button onClick={() => { if (field.current) { field.current.value = ''; writeField(field.current, draft); } }}>値を適用</button></span>}
        <button onClick={() => type('', true)}>⌫</button>
        <button onClick={() => type(' ')}>空白</button>
        <button onClick={() => type('\n')}>改行</button>
        <button onClick={() => { try { field.current?.setSelectionRange(0, field.current.value.length); } catch { /* 数値欄には選択範囲がない */ } }}>全選択</button>
        <button onClick={() => { const f = field.current; if (!f) return; if (f.form) f.form.requestSubmit(); else f.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', key: 'Enter', bubbles: true, cancelable: true })); }}>確定 / 送信</button>
        {Array.from(kana ? KANA : LETTERS).map(c => <button key={c} onClick={() => type(c)}>{c}</button>)}
        <span>Unicode: U+{hex || '…'}</span>{Array.from('0123456789ABCDEF').map(c => <button key={`hex${c}`} onClick={() => setHex((hex + c).slice(-6))}>{c}</button>)}
        <button onClick={() => setHex('')}>コード消去</button><button disabled={!unicodeCharacter(hex)} onClick={() => { type(unicodeCharacter(hex)); setHex(''); }}>文字追加</button>
        <button onClick={() => { field.current?.blur(); setEditing(false); }}>キーボードを閉じる</button>
      </div>}
    </>
  </div>, document.body);
}
