import { useEffect, useRef, useState, useSyncExternalStore, type PointerEvent } from 'react';
import { shareAnnotations, shareVideoEl } from './net/livekit.ts';
import { annotationColor, DRAWING_COLORS, normalizedPoint, paintAnnotations, videoRect, type Point } from './shareAnnotations.ts';
import { useStore, nameOf } from './store.ts';
import { t } from './i18n/core.ts';

// 共有の <video> を表示先へ移し、外れたら常駐ホルダーへ戻す（同一タスク内の移動なので再生は止まらない）
const holder = document.createElement('div');
Object.assign(holder.style, {
  position: 'fixed', left: '0', bottom: '0', width: '2px', height: '2px', opacity: '0', pointerEvents: 'none',
});
document.body.appendChild(holder);
holder.appendChild(shareVideoEl);

export function ShareVideoHost({ className }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const state = useSyncExternalStore(shareAnnotations.subscribe, shareAnnotations.snapshot);
  const [modeShare, setModeShare] = useState<string | null>(null);
  const active = !!state.share && modeShare === state.share;
  const previous = useRef<Point | null>(null);
  const pointer = useRef<number | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [color, setColor] = useState(DRAWING_COLORS[0]);
  const [erase, setErase] = useState(false);
  const lastMove = useRef(0);
  const [rect, setRect] = useState(() => videoRect(0, 0, 0, 0));
  useStore((s) => s.participants);
  const selfId = useStore((s) => s.selfId);
  useEffect(() => {
    const el = canvas.current!;
    el.width = 1024;
    el.height = Math.max(1, Math.round(1024 * rect.height / (rect.width || 1)));
    paintAnnotations(el.getContext('2d')!, state.segments);
  }, [state.segments, rect]);
  useEffect(() => {
    const host = hostRef.current!;
    const measure = () => setRect(videoRect(host.clientWidth, host.clientHeight, shareVideoEl.videoWidth, shareVideoEl.videoHeight));
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    shareVideoEl.addEventListener('resize', measure);
    shareVideoEl.addEventListener('loadedmetadata', measure);
    measure();
    return () => {
      observer.disconnect();
      shareVideoEl.removeEventListener('resize', measure);
      shareVideoEl.removeEventListener('loadedmetadata', measure);
    };
  }, []);
  useEffect(() => {
    previous.current = null;
    pointer.current = null;
    setColor(DRAWING_COLORS[0]);
    setErase(false);
    return () => { shareAnnotations.cursor(null); };
  }, [state.share]);
  useEffect(() => {
    const host = ref.current!;
    host.appendChild(shareVideoEl);
    void shareVideoEl.play().catch(() => {});
    return () => {
      holder.appendChild(shareVideoEl);
      void shareVideoEl.play().catch(() => {});
    };
  }, []);
  const locate = (event: PointerEvent) => {
    const bounds = hostRef.current!.getBoundingClientRect();
    return normalizedPoint(event.clientX - bounds.left, event.clientY - bounds.top, rect);
  };
  const move = (event: PointerEvent, force = false) => {
    if (!active || (pointer.current !== null && pointer.current !== event.pointerId)) return;
    if (!force && performance.now() - lastMove.current < 24) return;
    lastMove.current = performance.now();
    const point = locate(event);
    shareAnnotations.cursor(point);
    if (pointer.current === event.pointerId) {
      if (point && previous.current) shareAnnotations.draw(previous.current, point, erase ? 'erase' : color);
      previous.current = point;
    }
  };
  const finish = (event: PointerEvent) => {
    if (pointer.current !== event.pointerId) return;
    move(event, true);
    pointer.current = null;
    previous.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (event.pointerType !== 'mouse') shareAnnotations.cursor(null);
  };
  return <div ref={hostRef} className={`${className ?? ''} share-annotated`}>
    <div ref={ref} className="share-video-layer" />
    <div className={`share-drawing ${active ? 'active' : ''}`} style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
      onPointerDown={(event) => {
        if (!active || event.button !== 0 || pointer.current !== null) return;
        const point = locate(event);
        if (!point) return;
        event.stopPropagation();
        event.preventDefault();
        pointer.current = event.pointerId;
        previous.current = point;
        event.currentTarget.setPointerCapture(event.pointerId);
        shareAnnotations.cursor(point);
        shareAnnotations.draw(point, point, erase ? 'erase' : color);
      }}
      onPointerMove={(event) => move(event)} onPointerUp={finish}
      onPointerCancel={(event) => { finish(event); shareAnnotations.cursor(null); }}
      onLostPointerCapture={() => { pointer.current = null; previous.current = null; }}
      onPointerLeave={() => { shareAnnotations.cursor(null); previous.current = null; }}>
      <canvas ref={canvas} aria-hidden="true" />
      {[...state.cursors].map(([id, point]) => <span key={id} className="share-cursor" style={{
        left: `${point.x * 100}%`, top: `${point.y * 100}%`, color: annotationColor(id),
      }}><span aria-hidden="true">✎</span><span className="share-cursor-name" style={{ transform: `translate(${point.x > 0.7 ? '-100%' : '0'}, ${point.y > 0.85 ? '-100%' : '0'})` }}>{nameOf(id)}{id === selfId ? ` (${t('shareDrawingYou')})` : ''}</span></span>)}
    </div>
    {active && <div className="share-drawing-tools" role="toolbar" aria-label={t('shareDrawingStart')} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
      {DRAWING_COLORS.map((value) => <button key={value} type="button" className="share-drawing-color" style={{ background: value }}
        aria-label={t('shareDrawingColor', value)} aria-pressed={!erase && color === value} onClick={() => { setColor(value); setErase(false); }} />)}
      <button type="button" aria-pressed={erase} onClick={() => setErase(!erase)}>{t('ui343')}</button>
      <button type="button" className="share-drawing-clear" onClick={() => shareAnnotations.clear()}>{t('ui345')}</button>
    </div>}
    <button type="button" className="share-drawing-toggle" disabled={!state.share} aria-pressed={active}
      onClick={(event) => {
        event.stopPropagation();
        setModeShare(active ? null : state.share);
        previous.current = null;
        pointer.current = null;
        if (active) shareAnnotations.cursor(null);
      }}>{t(active ? 'shareDrawingStop' : 'shareDrawingStart')}</button>
  </div>;
}
