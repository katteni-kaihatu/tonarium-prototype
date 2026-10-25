import { useLanguage } from '../i18n/index.ts';
import { useEffect, useRef } from 'react';
import type { Item } from '../../../shared/items.ts';
import { useStore, get, type ItemUi } from '../store.ts';
import { PANELS } from './panels.ts';

const NO_UI = {};
/** 拡大しても文字がつぶれないように */
export const PANEL_SCALE = 2;

export function drawPanel(canvas: HTMLCanvasElement, item: Item, ui: ItemUi) {
  const panel = PANELS[item.kind];
  if (!panel) return;
  if (canvas.width !== panel.w * PANEL_SCALE) {
    canvas.width = panel.w * PANEL_SCALE;
    canvas.height = panel.h * PANEL_SCALE;
  }
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(PANEL_SCALE, 0, 0, PANEL_SCALE, 0, 0);
  panel.draw(ctx, item, ui);
}

export function PanelCanvas({ item, interactive }: { item: Item; interactive: boolean }) {
  const language = useLanguage();
  const ref = useRef<HTMLCanvasElement>(null);
  const ui = useStore((s) => s.itemUi[item.id] ?? NO_UI);
  const panel = PANELS[item.kind]!;
  useEffect(() => { drawPanel(ref.current!, item, ui); }, [item, ui, language]);

  const toPanel = (e: React.PointerEvent | React.MouseEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * panel.w, ((e.clientY - r.top) / r.height) * panel.h] as const;
  };
  // 描画中は何度も更新されるので、操作時点の最新状態を渡す
  const latest = () => [get().items[item.id] ?? item, get().itemUi[item.id] ?? {}] as const;

  const handlers = !interactive ? {} : panel.drag ? {
    onPointerDown: (e: React.PointerEvent<HTMLCanvasElement>) => {
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* 合成イベントなど */ }
      panel.drag!('start', ...toPanel(e), ...latest());
    },
    onPointerMove: (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (e.buttons) panel.drag!('move', ...toPanel(e), ...latest());
    },
    onPointerUp: (e: React.PointerEvent<HTMLCanvasElement>) => panel.drag!('end', ...toPanel(e), ...latest()),
  } : {
    onClick: (e: React.MouseEvent<HTMLCanvasElement>) => panel.click(...toPanel(e), ...latest()),
  };

  return (
    <canvas
      ref={ref}
      className={`panelcanvas ${panel.drag && interactive ? 'drawable' : ''}`}
      style={{ aspectRatio: `${panel.w} / ${panel.h}` }}
      {...handlers}
    />
  );
}
