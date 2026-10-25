import { useEffect } from 'react';
import { ANTIMATTER_CORE } from '../../../shared/antimatterLayout.ts';
import { get, useStore, worldKindOf } from '../store.ts';
import { fxVolume } from '../volume.ts';
import { getAntimatterPerSecond } from './engine.mjs';
import { subscribeAdFeedback } from './feedback.ts';
import { AdSoundPlayer } from './audio.ts';

/** Audio follows the open item or the physical lab, without adding a screen HUD. */
export function AdAudio() {
  useEffect(() => {
    const player = new AdSoundPlayer();
    const phoneWidth = window.matchMedia('(max-width: 720px)');

    function sceneActive() {
      const s = get();
      return s.joined && !!s.session && !s.hubOpen && !s.switching && !s.worldLoading && !document.hidden;
    }

    function panelVisible() {
      const s = get();
      if (s.phoneTab !== 'screen' && phoneWidth.matches) return false;
      const windows = s.maxWin ? s.windows.filter((w) => w.key === s.maxWin)
        : s.winMode === 'simple' ? s.windows.slice(-1) : s.windows;
      return windows.some(({ key }) => key === 'antimatter' || key === 'antimatter-space'
        || (key.startsWith('item:') && s.items[key.slice(5)]?.kind === 'antimatter'));
    }

    function contextGain() {
      const s = get();
      if (!sceneActive()) return 0;
      if (panelVisible()) return 1;
      if (s.mode !== '3d' || worldKindOf(s) !== 'antimatter') return 0;
      const distance = Math.hypot(s.selfAvatar.x - ANTIMATTER_CORE.x, s.selfAvatar.z - ANTIMATTER_CORE.z);
      const edge = Math.max(0, Math.min(1, (24 - distance) / 4));
      return edge / (1 + (distance / 10) ** 2);
    }

    function sync() {
      player.setVolume(fxVolume());
      if (!sceneActive()) { player.stop(); return; }
      const gain = contextGain();
      const game = get().adGame;
      if (!game || gain <= 0 || fxVolume() <= 0 || getAntimatterPerSecond(game).mantissa <= 0) {
        player.stopProduction();
        return;
      }
      player.production(gain);
    }

    const unsubscribeFeedback = subscribeAdFeedback((event) => {
      if (sceneActive()) player.play(event);
    });
    const unsubscribeStore = useStore.subscribe(sync);
    window.addEventListener('pointerdown', player.unlock, true);
    window.addEventListener('keydown', player.unlock, true);
    document.addEventListener('visibilitychange', sync);
    phoneWidth.addEventListener('change', sync);
    const timer = window.setInterval(sync, 250);
    sync();
    return () => {
      window.clearInterval(timer);
      unsubscribeFeedback();
      unsubscribeStore();
      window.removeEventListener('pointerdown', player.unlock, true);
      window.removeEventListener('keydown', player.unlock, true);
      document.removeEventListener('visibilitychange', sync);
      phoneWidth.removeEventListener('change', sync);
      player.dispose();
    };
  }, []);
  return null;
}
