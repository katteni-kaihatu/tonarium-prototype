import { t, useLanguage } from '../../i18n/index.ts';
// WindowLayer から使う AD ウィンドウの中身。購読はここで行い、
// WindowLayer 側が 100ms ごとに再描画されるのを避ける。
import { useStore } from '../../store.ts';
import { AntimatterPanelFromSlice } from './adapter.tsx';
import { AntimatterSpacePanel } from '../../view3d/antimatterPanels.tsx';
import { buildAdActions, buildAdLabSnapshot } from '../../ad/labView.ts';
import { createNewGame, type GameState } from '../../ad/engine.mjs';
import { closeWindow } from '../windows.ts';
import type { AdSlice } from '../../ad/slice.ts';

export function AntimatterWindowBody() {
  useLanguage();
  // engine はインプレース更新のため adVersion も購読する。
  const adVersion = useStore((s) => s.adVersion);
  void adVersion;
  const slice = useStore.getState() as unknown as AdSlice;
  if (!slice.adGame) return <div>{t('adLabText82')}</div>;
  return <AntimatterPanelFromSlice slice={slice} />;
}

export function AntimatterSpaceWindowBody() {
  useLanguage();
  const adVersion = useStore((s) => s.adVersion);
  const target = useStore((s) => s.adSpaceTarget);
  void adVersion;
  const slice = useStore.getState() as unknown as AdSlice;
  const game: GameState = slice.adGame ?? createNewGame();
  return (
    <AntimatterSpacePanel
      target={target ?? 'core'}
      snapshot={buildAdLabSnapshot(game)}
      actions={buildAdActions(slice)}
      isOwn
      onClose={() => closeWindow('antimatter-space')}
    />
  );
}
