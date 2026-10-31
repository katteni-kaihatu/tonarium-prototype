import type { FantasyAction, FantasyCharacter } from '../../../shared/fantasy.ts';
import { FantasyCooking } from './FantasyCooking.tsx';

export function FantasyOutdoorCooking({ c, onAction, blocked, mageAvailable = false }: { c: FantasyCharacter; onAction: (action: FantasyAction) => void; blocked: boolean; mageAvailable?: boolean }) {
  return <FantasyCooking key={`${c.name}:${c.lifeStartedAt ?? 0}`} c={c} station="outdoor" onAction={onAction} blocked={blocked} mageAvailable={mageAvailable}/>;
}
