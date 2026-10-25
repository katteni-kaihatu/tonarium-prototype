import { useSyncExternalStore } from 'react';

/** マウスの無いタッチ端末。3D はキーボードとマウスが前提なので 2D だけにする */
export const touchOnly = matchMedia('(hover: none) and (pointer: coarse)').matches;

const narrow = matchMedia('(max-width: 720px), (hover: none) and (pointer: coarse) and (max-width: 1024px) and (max-height: 540px)');
const subscribe = (f: () => void) => { narrow.addEventListener('change', f); return () => narrow.removeEventListener('change', f); };
/** スマホ幅のレイアウトにするか */
export const usePhone = () => useSyncExternalStore(subscribe, () => narrow.matches);
