import { t as tr } from '../i18n/index.ts';
import { heldCamera, heldHammer, useStore, worldKindOf } from '../store.ts';
import { MOVEMENT_MODES } from './movement.ts';

export function KeyHelp() {
  const movementMode = useStore((s) => s.movementMode);
  const lean = useStore((s) => s.lean);
  const locked = useStore((s) => s.locked);
  const survivorActive = useStore((s) => {
    const phase = s.survivors[s.session ?? '']?.phase;
    return worldKindOf(s) === 'survivors' && (phase === 'running' || phase === 'boss');
  });
  const holding = useStore((s) => !!heldHammer(s) || !!heldCamera(s));
  return (
    <div className="keyhelp">
      <span>{tr('mergeMovement', tr(MOVEMENT_MODES[movementMode]))} ・ {movementMode !== 'walk' && tr('mergeFlightControls')}{tr('mergeSettingsHint')} ・ {tr('cameraViewControls')}</span><br />
      {survivorActive && movementMode === 'walk'
        ? <>{tr('ui543')}</>
        : locked
          ? <>{tr('mergeMoveControls')}{movementMode === 'walk' && tr('mergeJumpControls')}{tr('mergeMouseControls')}{lean && !holding && tr('leanControls')}{holding && tr('ui545')} {tr('ui546')}</>
          : <>{tr('ui547')}</>}
    </div>
  );
}
