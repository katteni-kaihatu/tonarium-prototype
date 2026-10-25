import { sourceText as uiSource } from '../i18n/core.ts';
// 接続はここで1つだけ持ち、2D/3D の表示切替では切らない。セッションを移るときだけつなぎ直す。
import {
  Room, RoomEvent, Track, LocalVideoTrack,
  type RemoteTrack, type RemoteTrackPublication, type Participant as LkParticipant, type LocalTrackPublication,
} from 'livekit-client';
import { get, set, useStore } from '../store.ts';
import { addVoice, removeAllVoices, removeVoice } from '../spatial.ts';
import { send } from './ws.ts';

// HMR でこのモジュールが読み直されても同じ接続を使う（別の Room が同じ ID で入ると、互いに蹴り出してつなぎ直しを繰り返す）
const g = globalThis as unknown as { __tonariumRoom?: Room };
export const room = (g.__tonariumRoom ??= new Room({ adaptiveStream: false, dynacast: true }));
room.removeAllListeners();
for (const topic of ['msg', 'snapshot']) room.unregisterTextStreamHandler(topic);

/** 2D パネルと 3D スクリーン (VideoTexture) で共有する唯一の <video>（二重再生を防ぐ） */
export const shareVideoEl = document.createElement('video');
shareVideoEl.muted = true;
shareVideoEl.playsInline = true;
shareVideoEl.autoplay = true;

const audioHost = document.createElement('div');
audioHost.style.display = 'none';
document.body.appendChild(audioHost);

let reported = { micOn: false, sharing: false };

export const camVideos = new Map<string, HTMLVideoElement>();
export const camHolder = document.createElement('div');
Object.assign(camHolder.style, { position: 'fixed', left: '0', bottom: '0', width: '2px', height: '2px', opacity: '0', pointerEvents: 'none' });
document.body.appendChild(camHolder);
/** 映像フィードのキー: `camera:<アイテムID>` はアイテムID、`view:<ユーザーID>` はそのまま */
const camIdOf = (name: string | undefined) =>
  name?.startsWith('camera:') ? name.slice(7) : name?.startsWith('view:') ? name : null;

function setCamFeed(id: string, on: boolean) {
  set((s) => {
    const camFeeds = { ...s.camFeeds };
    if (on) camFeeds[id] = performance.now();
    else delete camFeeds[id];
    return { camFeeds };
  });
}

function syncParticipants() {
  if (get().voice !== 'connected') return;
  const all: LkParticipant[] = [room.localParticipant, ...room.remoteParticipants.values()];
  const speaking: Record<string, boolean> = {};
  const micOn: Record<string, boolean> = {};
  let sharer: string | null = null;
  let shareHasAudio = false;
  for (const p of all) {
    speaking[p.identity] = p.isSpeaking;
    micOn[p.identity] = p.isMicrophoneEnabled;
    const pub = p.getTrackPublication(Track.Source.ScreenShare);
    if (pub && pub.track && !pub.isMuted) {
      sharer = p.identity;
      shareHasAudio = !!p.getTrackPublication(Track.Source.ScreenShareAudio);
    }
  }
  const lp = room.localParticipant;
  set({ speaking, micOn, sharer, shareHasAudio, micEnabled: lp.isMicrophoneEnabled });
  // 他セッションの人にも見えるようにサーバーへ伝える
  const status = { micOn: lp.isMicrophoneEnabled, sharing: lp.isScreenShareEnabled };
  if (status.micOn !== reported.micOn || status.sharing !== reported.sharing) {
    reported = status;
    send({ t: 'status', ...status });
  }
}

/** 画面共有の音は空間に置かないので、要素の音量に全体の「動画・画面共有」を掛けるだけ */
const shareAudio = new Set<HTMLMediaElement>();
useStore.subscribe((s) => { for (const el of shareAudio) el.volume = s.audioVol.media; });

function attachRemote(track: RemoteTrack, pub: RemoteTrackPublication, identity: string) {
  const camId = camIdOf(pub.trackName);
  if (camId && track.kind === Track.Kind.Video) {
    const el = document.createElement('video');
    el.muted = true;
    el.playsInline = true;
    el.autoplay = true;
    camHolder.appendChild(el);
    track.attach(el);
    camVideos.set(camId, el);
    setCamFeed(camId, true);
    return;
  }
  if (track.kind === Track.Kind.Audio) {
    const el = track.attach();
    if (track.source === Track.Source.Microphone) {
      // 空間オーディオで鳴らす。Chrome では要素にもつながないと音が流れないので、要素はミュートして残す
      el.muted = true;
      addVoice(identity, track.mediaStreamTrack);
    } else {
      el.volume = get().audioVol.media;
      shareAudio.add(el);
    }
    audioHost.appendChild(el);
  } else if (track.source === Track.Source.ScreenShare) {
    track.attach(shareVideoEl);
  }
}

room
  .on(RoomEvent.TrackSubscribed, (track, pub, p) => { attachRemote(track, pub, p.identity); syncViewSubscriptions(); syncParticipants(); })
  .on(RoomEvent.TrackUnsubscribed, (track, pub, p) => {
    if (track.source === Track.Source.Microphone) removeVoice(p.identity);
    track.detach().forEach((el) => { shareAudio.delete(el); if (el !== shareVideoEl) el.remove(); });
    const camId = camIdOf(pub.trackName);
    if (camId) { camVideos.delete(camId); setCamFeed(camId, false); }
    syncParticipants();
  })
  .on(RoomEvent.LocalTrackPublished, (pub: LocalTrackPublication) => {
    if (pub.source === Track.Source.ScreenShare) pub.track?.attach(shareVideoEl);
    syncParticipants();
  })
  .on(RoomEvent.LocalTrackUnpublished, (pub: LocalTrackPublication) => {
    if (pub.source === Track.Source.ScreenShare) pub.track?.detach(shareVideoEl);
    syncParticipants();
  })
  .on(RoomEvent.TrackMuted, syncParticipants)
  .on(RoomEvent.TrackUnmuted, syncParticipants)
  .on(RoomEvent.TrackPublished, () => { syncViewSubscriptions(); syncParticipants(); })
  .on(RoomEvent.TrackUnpublished, syncParticipants)
  .on(RoomEvent.ParticipantConnected, syncParticipants)
  .on(RoomEvent.ParticipantDisconnected, syncParticipants)
  .on(RoomEvent.ActiveSpeakersChanged, syncParticipants)
  .on(RoomEvent.Reconnecting, () => set({ voice: 'connecting' }))
  .on(RoomEvent.Reconnected, () => { set({ voice: 'connected' }); syncParticipants(); })
  .on(RoomEvent.Disconnected, (reason) => {
    // 自分で切ったのでなければ、少し待ってつなぎ直す
    if (closing) return;
    console.warn('room disconnected', reason);
    const gen = generation;
    const sid = get().session;
    if (!sid) return;
    send({ t: 'status', micOn: false, sharing: false });
    set({ voice: 'unavailable', voiceError: uiSource('ui448') });
    setTimeout(() => { if (gen === generation && get().session === sid) void connectVoice(sid); }, 3000);
  });

/** 素早くセッションを移ったとき、古い接続結果を捨てるための世代 */
let generation = 0;
let closing = false;
async function closeRoom() {
  closing = true;
  try { await room.disconnect(); } finally { closing = false; }
}

function resetVoiceState() {
  audioHost.replaceChildren();
  camHolder.replaceChildren();
  removeAllVoices();
  camVideos.clear();
  set({ camFeeds: {} });
  shareVideoEl.srcObject = null;
  reported = { micOn: false, sharing: false };
  set({ speaking: {}, micOn: {}, sharer: null, shareHasAudio: false });
}

export async function leaveVoice() {
  generation++;
  await closeRoom();
  resetVoiceState();
  set({ voice: 'off', voiceError: null });
}

/** 接続失敗は「WebSocket エラー」としか出ないので、LiveKit の確認用 API で理由を聞き直す */
async function explainConnectError(url: string, token: string) {
  try {
    const res = await fetch(`${url.replace(/^ws/, 'http').replace(/\/$/, '')}/rtc/validate?access_token=${encodeURIComponent(token)}`);
    if (res.status === 429) return uiSource('ui449');
    if (res.status === 401) return uiSource('ui450');
    if (res.ok) return null;
    return uiSource('ui451', res.status);
  } catch {
    return uiSource('ui452', url);
  }
}

export async function connectVoice(sid: string) {
  const gen = ++generation;
  await closeRoom();
  resetVoiceState();
  if (gen !== generation) return;
  const s = get();
  set({ voice: 'connecting', voiceError: null });
  try {
    const q = new URLSearchParams({ id: s.selfId, name: s.selfName, session: sid });
    const j = await (await fetch(`/token?${q}`)).json();
    if (j.error) throw new Error(j.error);
    if (gen !== generation) return;
    try {
      await room.connect(j.url, j.token);
    } catch (e) {
      throw new Error(await explainConnectError(j.url, j.token) ?? (e as Error).message);
    }
    if (gen !== generation) { await closeRoom(); return; }
    await room.startAudio();
    set({ voice: 'connected' });
    syncParticipants();
  } catch (e) {
    if (gen === generation) set({ voice: 'unavailable', voiceError: String((e as Error).message ?? e) });
    return;
  }
  if (get().micEnabled) {
    try {
      await room.localParticipant.setMicrophoneEnabled(true);
    } catch (e) {
      set({ micEnabled: false, voiceError: uiSource('ui453', (e as Error).message) });
    }
  }
  syncParticipants();
}

export async function toggleMic() {
  const next = !get().micEnabled;
  set({ micEnabled: next });
  if (get().voice !== 'connected') return;
  try {
    await room.localParticipant.setMicrophoneEnabled(next);
  } catch (e) {
    set({ voiceError: uiSource('ui454', (e as Error).message) });
  }
  syncParticipants();
}

export async function toggleShare() {
  if (get().voice !== 'connected') return;
  const on = room.localParticipant.isScreenShareEnabled;
  try {
    await room.localParticipant.setScreenShareEnabled(
      !on,
      // Chrome/Edge: タブ共有ならタブ音声、Windows の画面全体共有ならシステム音声が付く
      { audio: true, systemAudio: 'include', suppressLocalAudioPlayback: false, selfBrowserSurface: 'exclude' },
      { videoEncoding: { maxBitrate: 3_000_000, maxFramerate: 30 } },
    );
  } catch (e) {
    if ((e as Error).name !== 'NotAllowedError') set({ voiceError: uiSource('ui455', (e as Error).message) });
  }
  syncParticipants();
}

export async function publishCamera(itemId: string, mediaTrack: MediaStreamTrack) {
  const track = new LocalVideoTrack(mediaTrack, undefined, true);
  const pub = await room.localParticipant.publishTrack(track, {
    name: `camera:${itemId}`,
    source: Track.Source.Camera,
    videoEncoding: { maxBitrate: 1_200_000, maxFramerate: 15 },
    simulcast: false,
  });
  return async () => {
    if (pub.track) await room.localParticipant.unpublishTrack(pub.track);
    track.stop();
  };
}

export async function publishView(canvas: HTMLCanvasElement) {
  const mediaTrack = canvas.captureStream(15).getVideoTracks()[0];
  const track = new LocalVideoTrack(mediaTrack, undefined, true);
  const pub = await room.localParticipant.publishTrack(track, {
    name: `view:${get().selfId}`,
    source: Track.Source.Camera,
    videoEncoding: { maxBitrate: 1_500_000, maxFramerate: 15 },
    simulcast: false,
  });
  return async () => {
    if (pub.track) await room.localParticipant.unpublishTrack(pub.track);
    track.stop();
  };
}

function syncViewSubscriptions() {
  const s = get();
  const myFollow = s.participants.find((p) => p.id === s.selfId)?.follow ?? null;
  for (const p of room.remoteParticipants.values())
    for (const pub of p.trackPublications.values()) {
      if (!pub.trackName.startsWith('view:')) continue;
      const want = myFollow === p.identity;
      if (pub.isSubscribed !== want) pub.setSubscribed(want);
    }
}
useStore.subscribe((s, prev) => { if (s.participants !== prev.participants) syncViewSubscriptions(); });
