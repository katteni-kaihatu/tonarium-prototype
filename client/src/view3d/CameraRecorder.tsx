import { useEffect, useRef, useState } from 'react';
import { t, useLanguage } from '../i18n/index.ts';
import type { Item } from '../../../shared/items.ts';
import { get, heldCamera, useStore } from '../store.ts';
import { postImage } from '../items/actions.ts';
import { makeRenderer, renderCamera, world } from './cameraRender.ts';
import { CameraRecording, RecordingSubmission, RECORD_HEIGHT, RECORD_WIDTH, boundary, encodeRecording, previewFrame, trimRange, type Recording } from './cameraRecording.ts';

export function CameraRecorder() {
  useLanguage();
  const held = useStore(s => heldCamera(s));
  const items = useStore(s => s.items);
  const session = useStore(s => s.session);
  const [cameraId, setCameraId] = useState('');
  const [recording, setRecording] = useState(false);
  const [draft, setDraft] = useState<Recording | null>(null);
  const [range, setRange] = useState<[number, number]>([0, 1]);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const canvas = useRef<HTMLCanvasElement>(null);
  const displayedFrame = useRef(0);
  const stop = useRef<(() => void) | null>(null);
  const submission = useRef(new RecordingSubmission());
  const alive = useRef(true);
  const choices = Object.values(items).filter((i): i is Item & { kind: 'camera' } => i.kind === 'camera' && (!i.holder || i.holder === get().selfId));
  const target = held ?? choices.find(i => i.id === cameraId) ?? choices[0];

  useEffect(() => { alive.current = true; return () => { alive.current = false; stop.current?.(); }; }, []);
  useEffect(() => { stop.current?.(); setPlaying(false); }, [session]);
  useEffect(() => {
    if (!draft || !canvas.current) return;
    const context = canvas.current.getContext('2d')!;
    const began = performance.now();
    let raf = 0;
    const draw = () => {
      const index = playing ? previewFrame(draft, range[0], range[1], performance.now() - began)
        : Math.max(range[0], Math.min(range[1] - 1, displayedFrame.current));
      displayedFrame.current = index;
      context.putImageData(new ImageData(new Uint8ClampedArray(draft.frames[index].pixels), RECORD_WIDTH, RECORD_HEIGHT), 0, 0);
      if (playing) raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [draft, range, playing]);

  const start = () => {
    if (stop.current || !target || !world.scene) return;
    document.exitPointerLock();
    setError('');
    let renderer: ReturnType<typeof makeRenderer> | undefined;
    try {
      renderer = makeRenderer(RECORD_WIDTH, RECORD_HEIGHT);
      const copy = document.createElement('canvas'); copy.width = RECORD_WIDTH; copy.height = RECORD_HEIGHT;
      const context = copy.getContext('2d', { willReadFrequently: true })!;
      const id = target.id;
      const capture = () => {
        const item = get().items[id];
        if (item?.kind !== 'camera') throw new Error('Camera unavailable');
        renderCamera(renderer!, item);
        context.drawImage(renderer!.domElement, 0, 0);
        const pixels = context.getImageData(0, 0, RECORD_WIDTH, RECORD_HEIGHT).data;
        for (let p = 0; p < pixels.length; p += 4) for (let c = 0; c < 3; c++) pixels[p + c] = (pixels[p + c] >> 6) * 85;
        return pixels;
      };
      const began = performance.now();
      let interval: ReturnType<typeof setInterval>, timeout: ReturnType<typeof setTimeout>;
      const recorder = new CameraRecording(capture, result => {
        clearInterval(interval); clearTimeout(timeout); stop.current = null;
        renderer!.dispose(); renderer!.forceContextLoss();
        if (alive.current) { displayedFrame.current = 0; submission.current = new RecordingSubmission(); setRecording(false); setDraft(result); setRange([0, result.frames.length]); setPlaying(false); }
      });
      let stopping = false;
      stop.current = () => {
        if (stopping) return;
        stopping = true;
        const elapsed = performance.now() - began;
        if (elapsed < 20) {
          clearTimeout(timeout);
          timeout = setTimeout(() => recorder.stop(performance.now() - began), 20 - elapsed);
        } else recorder.stop(elapsed);
      };
      interval = setInterval(() => {
        try { recorder.sample(performance.now() - began); }
        catch { stop.current?.(); if (alive.current) setError(t('cameraRecordInterrupted')); }
      }, 16);
      timeout = setTimeout(() => recorder.stop(10_000), 10_000);
      setRecording(true);
    } catch {
      renderer?.dispose(); renderer?.forceContextLoss();
      setError(t('cameraRecordFailed'));
    }
  };

  const post = async () => {
    if (!draft || submission.current.busy) return;
    setBusy(true); setError(''); setPlaying(false);
    const sid = get().session, self = get().selfId;
    try {
      if (!sid || get().sync !== 'connected') throw new Error('Disconnected');
      const [start, end] = range;
      const posted = await submission.current.post(draft, start, end, async () => {
        const bytes = await encodeRecording(draft, start, end);
        const image = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(new Blob([new Uint8Array(bytes)], { type: 'image/gif' }));
        });
        if (image.length >= 2_000_000) throw new Error('Image too large');
        return image;
      }, async (image, requestId) => {
        const received = () => (get().chats[sid] ?? []).some(m => m.from === self && m.clientRequestId === requestId && m.image === image);
        if (!received()) await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => finish(new Error('Confirmation timeout')), 30_000);
          const unsubscribe = useStore.subscribe(() => {
            if (received()) finish();
            else if (get().session !== sid || get().sync !== 'connected') finish(new Error('Disconnected'));
          });
          const finish = (error?: Error) => { clearTimeout(timer); unsubscribe(); error ? reject(error) : resolve(); };
          if (get().session !== sid || get().sync !== 'connected') finish(new Error('Disconnected'));
          else postImage(t('cameraGifPosted'), image, requestId);
        });
      });
      if (posted && alive.current) setDraft(null);
    } catch {
      if (alive.current) setError(t('cameraPostFailed'));
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  if (!target && !draft && !recording) return null;
  return <section className="camera-recorder" aria-label={t('cameraRecord')} onMouseDown={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
    {draft ? <>
      <canvas ref={canvas} width={RECORD_WIDTH} height={RECORD_HEIGHT} aria-label={t('cameraPreview')} />
      <label>{t('cameraStart', (boundary(draft, range[0]) / 1000).toFixed(2))}
        <input type="range" min={0} max={draft.frames.length - 1} step={1} value={range[0]} disabled={busy}
          onChange={e => { displayedFrame.current = 0; setPlaying(false); setRange(r => trimRange(...r, draft.frames.length, 'start', Number(e.target.value))); }} /></label>
      <label>{t('cameraEnd', (boundary(draft, range[1]) / 1000).toFixed(2))}
        <input type="range" min={1} max={draft.frames.length} step={1} value={range[1]} disabled={busy}
          onChange={e => { displayedFrame.current = 0; setPlaying(false); setRange(r => trimRange(...r, draft.frames.length, 'end', Number(e.target.value))); }} /></label>
      <div className="row"><button disabled={busy || playing} onClick={() => { displayedFrame.current = range[0]; setPlaying(true); }}>{t('cameraPlay')}</button>
        <button disabled={!playing} onClick={() => setPlaying(false)}>{t('cameraStop')}</button>
        <button disabled={busy} onClick={() => void post()}>{t(busy ? 'cameraPosting' : 'cameraPost')}</button>
        <button disabled={busy} onClick={() => { setDraft(null); setPlaying(false); }}>{t('cameraClose')}</button></div>
    </> : recording ? <button onClick={() => stop.current?.()}>{t('cameraRecordStop')}</button> : <>
      {!held && <select aria-label={t('cameraSelect')} value={target?.id} onChange={e => setCameraId(e.target.value)}>{choices.map((c, i) => <option key={c.id} value={c.id}>{t('cameraNumber', i + 1)}</option>)}</select>}
      <button onClick={start}>{t('cameraRecord')}</button>
    </>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
