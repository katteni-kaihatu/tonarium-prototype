import { useLanguage, getLanguage, setLanguage, t } from '../i18n/index.ts';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { Canvas, useThree } from '@react-three/fiber';
import type { Scene, Mesh, MeshBasicMaterial } from 'three';
import { createNewGame, bigFromLog10, serialize } from './engine.mjs';
import { createAdSlice, type AdSlice } from './slice.ts';
import { buildAdActions, buildAdLabSnapshot } from './labView.ts';
import { adaptAdSlice } from '../world/antimatter/adapter.tsx';
import { AntimatterPanel } from '../world/antimatter/AntimatterPanel.tsx';
import { AntimatterReadout } from '../view3d/AntimatterReadout.tsx';
import { PanelBoard, AntimatterSpacePanel, type AdActions } from '../view3d/antimatterPanels.tsx';
import { get, setAdBgmEnabled } from '../store.ts';

// Vite の開発用ページから実行する。実際の進行やサーバーには接続しない。
function check(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
const pause = (ms = 0) => new Promise(resolve => originalTimeout(resolve, ms));
const originalTimeout = window.setTimeout.bind(window);
const originalClearTimeout = window.clearTimeout.bind(window);
const originalConfirm = window.confirm;
const originalFillText = CanvasRenderingContext2D.prototype.fillText;
const draws = new WeakMap<HTMLCanvasElement, string[]>();
const clipped = new WeakSet<HTMLCanvasElement>();
let scene: Scene;
function Probe() { scene = useThree(state => state.scene); return null; }

async function run() {
  const previous = getLanguage();
  const root = createRoot(document.getElementById('panel')!);
  const space = createRoot(document.getElementById('space')!);
  let slice: AdSlice;
  slice = createAdSlice(partial => Object.assign(slice, partial), () => slice);
  slice.adGame = createNewGame(0);
  slice.adGame.antimatter = bigFromLog10(309);
  slice.adGame.dimensionalBoosts = 6;
  slice.adGame.infinities = 1;
  slice.adProfile = { id: 'unchanged-id', name: '名前 {0} 플레이어', createdAt: null };
  slice.adSync = 'ready';
  const ad = adaptAdSlice(slice)!;
  let crunches = 0;
  ad.prestigeInfinity = () => { crunches++; return 7; };
  const before = serialize(slice.adGame);
  const savedProfile = JSON.stringify(slice.adProfile);
  const host = document.getElementById('panel')!;
  const click = async (label: string, scope: ParentNode = host) => {
    const button = [...scope.querySelectorAll('button')].find(node => node.textContent === label);
    check(button && !button.disabled, `Available button: ${label}`);
    flushSync(() => button.click());
    await pause();
  };
  const cycle = async (verify: () => void) => {
    for (const language of ['ja', 'en', 'ko', 'ja'] as const) {
      flushSync(() => setLanguage(language));
      await pause(50);
      verify();
      check(serialize(slice.adGame!) === before, 'Progress unchanged');
      check(JSON.stringify(slice.adProfile) === savedProfile, 'Profile ID and name unchanged');
    }
  };
  const tab = () => host.querySelector('button[aria-pressed="true"]:not([aria-label])');
  let scheduled = 0, cancelled = 0;
  let expire: (() => void) | undefined;
  const noticeTimer = 2147483647;
  window.setTimeout = ((handler: TimerHandler, delay?: number, ...args: unknown[]) => {
    if (delay !== 5000) return originalTimeout(handler, delay, ...args);
    scheduled++;
    check(typeof handler === 'function', 'Notice uses callback');
    expire = () => handler(...args);
    return noticeTimer;
  }) as typeof window.setTimeout;
  window.clearTimeout = ((id?: number) => {
    if (id === noticeTimer) { cancelled++; return; }
    originalClearTimeout(id);
  }) as typeof window.clearTimeout;
  CanvasRenderingContext2D.prototype.fillText = function(text, x, y, maxWidth?) {
    if (this.canvas instanceof HTMLCanvasElement) {
      const rows = draws.get(this.canvas) ?? [];
      rows.push(text); draws.set(this.canvas, rows);
      const metrics = this.measureText(text);
      const left = x - (this.textAlign === 'center' ? metrics.width / 2 : 0);
      if (left < 0 || left + metrics.width > this.canvas.width || y - metrics.actualBoundingBoxAscent < 0 || y + metrics.actualBoundingBoxDescent > this.canvas.height) clipped.add(this.canvas);
    }
    if (maxWidth === undefined) originalFillText.call(this, text, x, y);
    else originalFillText.call(this, text, x, y, maxWidth);
  };
  try {
    setLanguage('ja');
    flushSync(() => root.render(<AntimatterPanel ad={ad} />));
    await pause();
    const previousBgm = get().adBgmEnabled;
    const spaceHost = document.getElementById('space')!;
    const renderSpace = () => space.render(<AntimatterSpacePanel target="core" snapshot={buildAdLabSnapshot(slice.adGame!)} actions={buildAdActions(slice)} isOwn={false} />);
    try {
      flushSync(() => { setAdBgmEnabled(true); renderSpace(); });
      await click(t('adBgmOn'));
      await cycle(() => {
        for (const scope of [host, spaceHost]) {
          const button = scope.querySelector(`button[aria-label="${t('adBgmLabel')}"]`);
          check(button?.getAttribute('aria-pressed') === 'false', 'Personal BGM off in both views');
          check(button?.textContent === t('adBgmOff'), 'BGM label follows language');
          check(button?.getAttribute('type') === 'button', 'Native keyboard button');
        }
      });
      flushSync(() => space.render(null));
      flushSync(renderSpace);
      check(spaceHost.querySelector('button[aria-pressed="false"]'), 'BGM remains off after reopening');
      await click(t('adBgmOff'), spaceHost);
      check(host.querySelector(`button[aria-label="${t('adBgmLabel')}"]`)?.getAttribute('aria-pressed') === 'true', '3D updates 2D');
    } finally {
      flushSync(() => { setAdBgmEnabled(previousBgm); space.render(null); });
    }
    const panel = host.firstElementChild;
    await cycle(() => {
      check(host.firstElementChild === panel, 'Panel retained');
      check(tab()?.textContent === t('adLabText4'), 'Dimensions tab retained');
      check(host.querySelector('[data-tier="1"] button')?.getAttribute('aria-label') === t('adLabText23', 1), 'Memoized dimension row updates');
    });
    await click(t('adLabText6'));
    await cycle(() => check(tab()?.textContent === t('adLabText6') && host.textContent?.includes(t('adLabText133')), 'Statistics update in place'));
    await click(t('adLabText7'));
    const layerButtons = host.querySelectorAll('button');
    const infinityTab = [...layerButtons].find(button => button.textContent?.startsWith(t('adLabText150')));
    check(infinityTab, 'Infinity layer available');
    flushSync(() => infinityTab.click());
    await cycle(() => check(host.textContent?.includes(t('adLabText71')), 'Selected Infinity layer retained'));
    await click(t('adLabText5'));
    await cycle(() => check(tab()?.textContent === t('adLabText5'), 'Actions tab retained'));
    const confirmations: string[] = [];
    window.confirm = text => { confirmations.push(text ?? ''); return false; };
    await cycle(() => {
      const button = [...host.querySelectorAll('button')].find(node => node.textContent === t('adLabText31'))!;
      button.click();
      check(confirmations.at(-1) === t('adLabText34', ad.derived.infinity.gain), 'Crunch confirmation follows language');
      check(crunches === 0 && scheduled === 0, 'Cancellation does not dispatch or notify');
    });
    window.confirm = () => true;
    await click(t('adLabText31'));
    check(scheduled === 1, 'Notice scheduled once');
    await click(t('adSaveTab'));
    const input = host.querySelector('input')!;
    const textarea = host.querySelector('textarea')!;
    const fill = (element: HTMLInputElement | HTMLTextAreaElement, value: string) => {
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value')!.set!.call(element, value);
      flushSync(() => element.dispatchEvent(new Event('input', { bubbles: true })));
    };
    fill(input, 'Transfer 이름 {0}'); fill(textarea, 'unfinished save 入力 플레이어');
    await cycle(() => {
      check(tab()?.textContent === t('adSaveTab'), 'Save tab retained');
      check(host.querySelector('input') === input && input.value === 'Transfer 이름 {0}', 'Transfer input retained');
      check(host.querySelector('textarea') === textarea && textarea.value === 'unfinished save 入力 플레이어', 'Save input retained');
      check(textarea.getAttribute('aria-label') === t('adExportTitle'), 'Input label updates');
      check(host.textContent?.includes(t('adLabText35', 7)), 'Displayed notice translated with event gain');
      check(scheduled === 1 && cancelled === 0 && crunches === 1, 'Switching does not extend deadline or repeat action');
    });
    check(expire, 'Original notice deadline exists');
    flushSync(expire);
    await pause();
    check(!host.textContent?.includes(t('adLabText35', 7)), 'Notice expires at original deadline');

    function Boards() {
      useLanguage();
      const snapshot = buildAdLabSnapshot(slice.adGame!);
      return <><AntimatterReadout snapshot={snapshot} onOpen={() => {}} />
        <group name="test-board"><PanelBoard position={[0, 2, 0]} lines={[t('adLabText13', 8), t('adLabText89', snapshot.antimatterText), t('adLabText90', '0'), t('adLabText91', '1e309')]} hint={t('adLabText87')} onOpen={() => {}} /></group>
        <Probe /></>;
    }
    flushSync(() => space.render(<Canvas camera={{ position: [0, 4, 12] }}><Boards /></Canvas>));
    for (let attempt = 0; attempt < 100 && !scene?.getObjectByName('antimatter-readout-face-0'); attempt++) await pause(50);
    const mesh = scene?.getObjectByName('antimatter-readout-face-0') as Mesh;
    check(mesh, 'Real 3D readout mounted');
    const readout = (mesh.material as MeshBasicMaterial).map!;
    let readoutDisposed = 0;
    readout.addEventListener('dispose', () => readoutDisposed++);
    let previousBoard: ReturnType<typeof boardTexture> | undefined;
    let boardDisposed = 0;
    function boardTexture() {
      const group = scene.getObjectByName('test-board')!;
      return ((group.children[0].children[1] as Mesh).material as MeshBasicMaterial).map!;
    }
    await cycle(() => {
      check((mesh.material as MeshBasicMaterial).map === readout, 'Readout texture retained');
      check(readout.image instanceof HTMLCanvasElement, 'Readout uses an HTML Canvas');
      check(draws.get(readout.image)?.at(-3) === t('adLabText55'), 'Unchanged readout numbers redraw immediately');
      check(!clipped.has(readout.image), 'Readout text fits real Canvas metrics');
      check(scene.getObjectByName('antimatter-core-instrument')?.userData.hint === t('adLabText87'), 'Aim hint updates');
      const board = boardTexture();
      check(board.image instanceof HTMLCanvasElement, 'Board uses an HTML Canvas');
      check(draws.get(board.image)?.at(-4) === t('adLabText13', 8), 'Board bypasses one second throttle on language switch');
      check(draws.get(board.image)?.at(-1) === t('adLabText91', '1e309'), 'Bottom board row drawn');
      check(!clipped.has(board.image), 'All board rows fit real Canvas metrics');
      if (previousBoard) check(board !== previousBoard, 'Board texture replaced');
      board.addEventListener('dispose', () => boardDisposed++);
      previousBoard = board;
      check(readoutDisposed === 0, 'Live readout is not disposed');
    });
    flushSync(() => space.unmount());
    await pause();
    check(readoutDisposed === 1 && boardDisposed >= 4, 'Canvas textures disposed on replacement/unmount');

    let actions = 0;
    const action = () => { actions++; };
    const controls: AdActions = { buyDimension: action, buyDimensionUpTo: action, buyDimensionMax: action, buyTickspeed: action, dimensionalBoost: action, antimatterGalaxy: action, sacrifice: action, prestigeInfinity: action };
    function Controls({ target, own }: { target: 'dimension-1' | 'boost' | 'galaxy' | 'sacrifice' | 'crunch'; own: boolean }) {
      useLanguage();
      return <AntimatterSpacePanel target={target} snapshot={buildAdLabSnapshot(slice.adGame!)} actions={controls} isOwn={own} />;
    }
    for (const target of ['dimension-1', 'boost', 'galaxy', 'sacrifice', 'crunch'] as const) {
      flushSync(() => root.render(<Controls target={target} own={false} />));
      await cycle(() => {
        const buttons = host.querySelectorAll('button');
        check(buttons.length > 0 && [...buttons].every(button => button.disabled), `${target}: nonowner cannot operate`);
        buttons.forEach(button => button.click());
        check(actions === 0, 'Nonowner action not dispatched');
      });
      flushSync(() => root.render(<Controls target={target} own />));
      const snapshot = buildAdLabSnapshot(slice.adGame!);
      const available = target === 'dimension-1' || (target === 'boost' ? snapshot.canBoost : target === 'galaxy' ? snapshot.canGalaxy : target === 'sacrifice' ? snapshot.canSacrifice : snapshot.canCrunch);
      await cycle(() => check([...host.querySelectorAll('button')].every(button => button.disabled === !available), `${target}: owner eligibility retained`));
    }
    document.getElementById('result')!.textContent = 'PASS: mounted ja → en → ko → ja; tabs, inputs, notices, unchanged-number Canvas, disposal, ownership.\nVisual clipping and confirmation/cancellation in the full application still require manual inspection.';
  } finally {
    flushSync(() => root.unmount());
    // 途中で失敗したときも Three の購読とタイマーを残さない。
    if (document.getElementById('space')?.childElementCount) space.unmount();
    window.setTimeout = originalTimeout;
    window.clearTimeout = originalClearTimeout;
    window.confirm = originalConfirm;
    CanvasRenderingContext2D.prototype.fillText = originalFillText;
    setLanguage(previous);
  }
}
void run().catch(error => { document.getElementById('result')!.textContent = `FAIL: ${String(error)}`; console.error(error); });
