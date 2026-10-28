import { get, set, save } from './store.ts';

export type VolumeKind = 'voice' | 'fx' | 'media';

export function setMasterVolume(k: VolumeKind, v: number) {
  set((s) => {
    const audioVol = { ...s.audioVol, [k]: Math.max(0, Math.min(1, v)) };
    save('tonarium.audioVol', audioVol);
    return { audioVol };
  });
}

/** ミュート中でも、解除したときに戻せるよう音量は残しておく */
export const peerLevel = (id: string, s = get()) => s.peerVolume[id] ?? 1;
export const peerGain = (id: string, s = get()) => (s.peerMuted.includes(id) ? 0 : peerLevel(id, s));

export function setPeerVolume(id: string, v: number) {
  set((s) => {
    const peerVolume = { ...s.peerVolume, [id]: Math.max(0, Math.min(2, v)) };
    if (peerVolume[id] === 1) delete peerVolume[id];
    save('tonarium.peerVolumeById', peerVolume);
    return { peerVolume };
  });
}

export function togglePeerMute(id: string) {
  set((s) => {
    const peerMuted = s.peerMuted.includes(id) ? s.peerMuted.filter((n) => n !== id) : [...s.peerMuted, id];
    save('tonarium.peerMutedIds', peerMuted);
    return { peerMuted };
  });
}

export const fxVolume = () => get().audioVol.fx;
