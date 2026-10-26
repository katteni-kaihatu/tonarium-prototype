import { useEffect } from 'react';
import { get } from '../store.ts';
import { standFromSystemSeat } from './api.ts';
import { useSystems } from './state.ts';
import { SeatSpaceShortcut } from './seat-input.ts';

export function useSpaceToStand() {
  useEffect(() => {
    const shortcut = new SeatSpaceShortcut(() => {
      const systems = useSystems.getState(), app = get();
      return systems.sid === app.session && Object.values(systems.view?.seats ?? {}).includes(app.selfId);
    }, () => { void standFromSystemSeat().catch(error => useSystems.setState({ error: error instanceof Error ? error.message : '일어서기를 처리하지 못했습니다.' })); });
    const down = (event: KeyboardEvent) => { shortcut.down(event); };
    const up = (event: KeyboardEvent) => { shortcut.up(event); };
    const blur = () => shortcut.reset();
    // 先に処理して、着席解除後のキーリピートをジャンプへ渡さない。
    window.addEventListener('keydown', down, true);
    window.addEventListener('keyup', up, true);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down, true);
      window.removeEventListener('keyup', up, true);
      window.removeEventListener('blur', blur);
    };
  }, []);
}
