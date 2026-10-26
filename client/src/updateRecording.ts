import { useSyncExternalStore } from 'react';
import { sendMessage } from './actions.ts';
import { t } from './i18n/core.ts';
import { get } from './store.ts';

interface Segment { blob: Blob; seconds: number; url?: string }
interface SavedRecording { id: string; conv: string; resume: boolean; segments: Segment[] }
interface Recording extends SavedRecording {
  recorder?: MediaRecorder;
  stopped?: Promise<void>;
  uploading?: Promise<void>;
  persisted?: boolean;
  started: number;
  timer?: ReturnType<typeof setInterval>;
}
const recordings = new Map<string, Recording>();
const listeners = new Set<() => void>();
let preparing = false;
const emit = () => listeners.forEach(listener => listener());
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

async function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('tonarium-update-recordings', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('recordings', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function savedRecording(id: string, value?: SavedRecording | null): Promise<SavedRecording | undefined> {
  const db = await database();
  try {
    return await new Promise<SavedRecording | undefined>((resolve, reject) => {
      const tx = db.transaction('recordings', value === undefined ? 'readonly' : 'readwrite');
      const store = tx.objectStore('recordings');
      const request = value === undefined ? store.get(id) : value === null ? store.delete(id) : store.put(value);
      tx.oncomplete = () => resolve(value === undefined ? request.result : undefined);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}

async function upload(recording: Recording) {
  if (recording.uploading) return recording.uploading;
  recording.uploading = (async () => {
    while (recording.segments.length && !preparing) {
      const segment = recording.segments[0];
      if (!segment.url) {
        const response = await fetch('/media', { method: 'POST', body: segment.blob });
        const result = await response.json() as { url?: string };
        if (!response.ok || !result.url) throw new Error(t('updateRecordingFailed'));
        segment.url = result.url;
      }
      if (preparing) return;
      if (!get().wsReady) throw new Error(t('updateConnectionFailed'));
      sendMessage(recording.conv, { text: '', voice: { url: segment.url, sec: segment.seconds } });
      recording.segments.shift();
    }
    if (!recording.segments.length && !recording.resume) {
      recordings.delete(recording.id);
      if (recording.persisted) await savedRecording(recording.id, null);
    }
  })().finally(() => { recording.uploading = undefined; emit(); });
  return recording.uploading;
}
function notify(error: unknown) {
  window.dispatchEvent(new CustomEvent('tonarium-recording-error', { detail: t('updateRecordingFailed') + ': ' + String(error) }));
}
async function start(recording: Recording) {
  if (recording.recorder || preparing) return;
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  if (preparing) { stream.getTracks().forEach(track => track.stop()); return; }
  try {
    const recorder = new MediaRecorder(stream, MediaRecorder.isTypeSupported('audio/webm') ? { mimeType: 'audio/webm' } : undefined);
    const chunks: Blob[] = [];
    recording.started = Date.now();
    recording.resume = true;
    recording.recorder = recorder;
    recording.stopped = new Promise(resolve => {
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = () => {
        clearInterval(recording.timer);
        stream.getTracks().forEach(track => track.stop());
        recording.recorder = undefined;
        recording.segments.push({ blob: new Blob(chunks, { type: recorder.mimeType }), seconds: Math.max(1, Math.round((Date.now() - recording.started) / 1000)) });
        emit(); resolve();
        if (!preparing) void upload(recording).catch(notify);
      };
    });
    recorder.start();
    recording.timer = setInterval(() => {
      emit();
      if (Date.now() - recording.started >= 60000) stop(recording);
    }, 250);
    emit();
  } catch (error) { recording.recorder = undefined; stream.getTracks().forEach(track => track.stop()); throw error; }
}
function stop(recording: Recording) {
  recording.resume = false;
  if (recording.recorder?.state === 'recording') recording.recorder.stop();
  else void upload(recording).catch(notify);
}

export async function prepareRecordings() {
  preparing = true;
  try {
    const refs: { id: string; conv: string }[] = [];
    for (const recording of recordings.values()) {
      if (recording.recorder?.state === 'recording') recording.recorder.stop();
      await recording.stopped;
      // ネットワーク完了は待たず、送信済みでない区間をローカルに保存する。
      await savedRecording(recording.id, { id: recording.id, conv: recording.conv, resume: recording.resume, segments: recording.segments });
      recording.persisted = true;
      refs.push({ id: recording.id, conv: recording.conv });
    }
    return refs;
  } catch (error) { preparing = false; throw error; }
}
export async function restoreRecordings(refs: { id: string; conv: string }[]) {
  preparing = false;
  const issues: string[] = [];
  for (const ref of refs) {
    try {
      const saved = await savedRecording(ref.id);
      if (!saved || saved.conv !== ref.conv) throw new Error(t('updateInvalidRecovery'));
      const recording: Recording = { ...saved, started: 0, persisted: true };
      recordings.set(recording.id, recording);
      if (recording.resume) {
        // 権限未付与の環境では自動で許可画面を開かず、復元ダイアログで操作を案内する。
        const permission = await navigator.permissions.query({ name: 'microphone' as PermissionName }).catch(() => null);
        if (permission?.state !== 'granted') throw new Error(t('updateRecordingPermission'));
        await start(recording);
      } else await upload(recording);
    } catch (error) { issues.push(t('updateRecordingFailed') + ': ' + String(error)); }
  }
  emit();
  return issues;
}
export async function retryRecordings() {
  const issues: string[] = [];
  for (const recording of recordings.values()) {
    try { if (recording.resume) await start(recording); else await upload(recording); }
    catch (error) { issues.push(t('updateRecordingFailed') + ': ' + String(error)); }
  }
  return issues;
}
export function abandonRecordings() { preparing = false; void retryRecordings().then(issues => issues.forEach(notify)); }

export function useVoiceRecorder(conv: string) {
  const seconds = useSyncExternalStore(subscribe, () => {
    const active = [...recordings.values()].find(recording => recording.conv === conv && recording.recorder);
    return active ? Math.floor((Date.now() - active.started) / 1000) : null;
  });
  return { recording: seconds !== null, sec: seconds ?? 0, toggle: () => {
    const active = [...recordings.values()].find(recording => recording.conv === conv && recording.resume);
    if (active) stop(active);
    else {
      const recording: Recording = { id: crypto.randomUUID(), conv, resume: false, segments: [], started: 0 };
      recordings.set(recording.id, recording);
      void start(recording).catch(error => { recordings.delete(recording.id); notify(error); });
    }
  } };
}
