// antimatter ワールドの接着層。WorldMesh から呼ばれ、
// zustand の ad 状態を 250ms 間隔でスナップショット化して AntimatterLab へ渡す。
// 100ms の tick ごとに Canvas を再描画させないための間引きである。
import { useEffect, useState } from 'react';
import { useStore } from '../store.ts';
import { AntimatterLab } from './antimatterLab.tsx';
import { buildAdLabSnapshot } from '../ad/labView.ts';
import { createNewGame } from '../ad/engine.mjs';
import { openWindow } from '../world/windows.ts';
import { emitAdFeedback } from '../ad/feedback.ts';
import type { AdLabSnapshot, AdPanelTarget } from '../../../shared/antimatterLayout.ts';

export function AntimatterWorld() {
  const [snapshot, setSnapshot] = useState<AdLabSnapshot | null>(null);
  useEffect(() => {
    const update = () => {
      const game = useStore.getState().adGame ?? createNewGame();
      setSnapshot(buildAdLabSnapshot(game));
    };
    update();
    const id = window.setInterval(update, 250);
    return () => window.clearInterval(id);
  }, []);
  if (!snapshot) return null;
  const onOpenPanel = (target: AdPanelTarget) => {
    useStore.setState({ adSpaceTarget: target });
    openWindow('antimatter-space');
    emitAdFeedback({ kind: 'navigate' });
  };
  return <AntimatterLab snapshot={snapshot} isOwn onOpenPanel={onOpenPanel} />;
}
