import { useStore, get, set, save, type Win, type WinMode } from '../store.ts';
import type { Item } from '../../../shared/items.ts';
import { send } from '../net/ws.ts';

const SPOTS = [{ x: 380, y: 150 }, { x: 860, y: 140 }, { x: 420, y: 440 }, { x: 840, y: 420 }, { x: 620, y: 260 }];
const cascade = (n: number) => {
  const p = SPOTS[n % SPOTS.length];
  const k = Math.floor(n / SPOTS.length) * 30;
  return { x: Math.min(p.x + k, window.innerWidth - 360), y: Math.min(p.y + k, window.innerHeight - 200) };
};

/** 開いたものがいちばん前（カンタンモードでは大きく表示されるもの）になる */
export function openWindow(key: string) {
  set((s) => {
    const existing = s.windows.find((w) => w.key === key);
    const rest = s.windows.filter((w) => w.key !== key);
    // スマホでリストから開いたときに、ウィンドウが見えるタブへ移る
    return { windows: [...rest, existing ?? { key, ...cascade(rest.length) }], phoneTab: 'screen' };
  });
}

export function closeWindow(key: string, force = false) {
  if (key === 'survivors' && !force) {
    if (get().confirmClose === key) set({ confirmClose: null });
    return;
  }
  set((s) => ({ windows: s.windows.filter((w) => w.key !== key), maxWin: s.maxWin === key ? null : s.maxWin, confirmClose: null }));
}

export function raiseWindow(key: string) {
  const ws = get().windows;
  if (ws[ws.length - 1]?.key === key) return;
  const w = ws.find((x) => x.key === key);
  if (w) set({ windows: [...ws.filter((x) => x !== w), w] });
}

export function moveWindow(key: string, x: number, y: number) {
  set((s) => ({ windows: s.windows.map((w): Win => (w.key === key ? { ...w, x, y } : w)) }));
}

export const toggleMax = (key: string) => set((s) => ({ maxWin: s.maxWin === key ? null : key }));

export function setWinMode(winMode: WinMode) {
  save('tonarium.winMode', winMode);
  set({ winMode });
}

export const useIsOpen = (key: string) => useStore((s) => s.windows.some((w) => w.key === key));

/** 開いたウィンドウを閉じるときだけ確認を出す（リストのボタンから） */
export function toggleFromList(key: string) {
  if (get().windows.some((w) => w.key === key) && key === 'survivors') raiseWindow(key);
  else if (get().windows.some((w) => w.key === key)) set({ confirmClose: key });
  else openWindow(key);
}

// 開いているウィンドウを「閲覧中」として周りに伝える
let lastSent = '';
useStore.subscribe((s) => {
  const keys = s.session ? s.windows.map((w) => w.key) : [];
  const k = keys.join('\n');
  if (k === lastSent) return;
  lastSent = k;
  send({ t: 'viewing', keys });
});

export function resendViewing() {
  lastSent = '';
  send({ t: 'viewing', keys: get().windows.map((w) => w.key) });
}

/** AD 研究所のウィンドウ（ワールド用のものと、AD ポータルのアイテムから開いたもの） */
export const isAdWindow = (key: string, item?: Pick<Item, 'kind'>) => key === 'antimatter' || item?.kind === 'antimatter';
