import type { FantasyCombatFighter, FantasyCombatState } from '../../../shared/fantasy-combat.ts';
import { fantasyCombatActors, fantasyCombatMoveRange, fantasyCombatPath, fantasyCombatTileKey, type FantasyCombatTile } from '../../../shared/fantasy-combat-tactics.ts';
import type { NpcLocale } from '../../../shared/npc.ts';

export function FantasyTacticalBoard({ battle, actor, locale, selected, moving, onTile, onTarget }: {
  battle: FantasyCombatState; actor?: FantasyCombatFighter; locale: NpcLocale; selected?: FantasyCombatTile; moving: boolean;
  onTile: (tile: FantasyCombatTile) => void; onTarget: (id: string) => void;
}) {
  if (!battle.battlefield) return null;
  const field = battle.battlefield, actors = fantasyCombatActors(battle), text = (ko: string, en: string, ja: string) => ({ ko, en, ja })[locale];
  const cells = Array.from({ length: field.width * field.height }, (_, index) => ({ x: index % field.width, y: Math.floor(index / field.width) }));
  return <div className="fr-tactical"><p className="fr-muted">{moving ? text(`이동할 칸을 고르세요. 이번 이동 ${actor ? fantasyCombatMoveRange(actor) : 0}칸`, `Choose a destination. Move up to ${actor ? fantasyCombatMoveRange(actor) : 0} tiles`, `移動先を選んでください。今回は${actor ? fantasyCombatMoveRange(actor) : 0}マス`) : text('칸을 눌러 대상을 고를 수 있어요. ▰ 벽 · ▧ 엄폐', 'Select a target on the field. ▰ Wall · ▧ Cover', 'マスを押して対象を選べます。▰ 壁・▧ 遮蔽')}</p>
    <div className="fr-tactical-scroll"><div className="fr-tactical-grid" role="group" aria-label={text('전술 지도', 'Tactical map', '戦術地図')} style={{ gridTemplateColumns: `repeat(${field.width}, minmax(34px, 1fr))` }}>{cells.map(tile => {
      const key = fantasyCombatTileKey(tile), occupant = actors.find(f => f.hp > 0 && !f.fled && f.tile && fantasyCombatTileKey(f.tile) === key);
      const wall = field.blocked.some(t => fantasyCombatTileKey(t) === key), cover = field.cover.some(t => fantasyCombatTileKey(t) === key);
      const path = moving && actor ? fantasyCombatPath(battle, actor, tile) : undefined, reachable = !!path && path.length > 1 && path.length - 1 <= fantasyCombatMoveRange(actor!);
      const exit = !!battle.escort && fantasyCombatTileKey(battle.escort.exit) === key, wagon = !!occupant && occupant.id === battle.escort?.wagon.id;
      const description = `${tile.x + 1},${tile.y + 1} · ${occupant?.names[locale] ?? (wall ? text('벽', 'Wall', '壁') : exit ? text('호송 출구', 'Caravan exit', '護送出口') : cover ? text('엄폐', 'Cover', '遮蔽') : text('빈칸', 'Empty', '空きマス'))}${reachable ? ` · ${text('이동 가능', 'Reachable', '移動可能')}` : ''}`;
      return <button key={key} type="button" className={`fr-tactical-cell ${wall ? 'wall' : ''} ${cover ? 'cover' : ''} ${exit ? 'escort-exit' : ''} ${wagon ? 'escort-wagon' : ''} ${occupant?.side ?? ''} ${occupant?.companion ? 'companion' : ''} ${occupant?.id === actor?.id ? 'acting' : ''} ${reachable ? 'reachable' : ''} ${selected && fantasyCombatTileKey(selected) === key ? 'selected' : ''}`}
        title={description} aria-label={description} aria-pressed={!!selected && fantasyCombatTileKey(selected) === key}
        onClick={() => { if (moving) onTile(tile); else if (occupant) onTarget(occupant.id); }}>
        <small>{tile.x + 1},{tile.y + 1}</small><b>{occupant ? wagon ? '▣' : occupant.names[locale].slice(0, 3) : wall ? '▰' : exit ? '⚑' : cover ? '▧' : '·'}</b>{occupant && <meter min={0} max={occupant.stats.hp} value={occupant.hp} />}
      </button>;
    })}</div></div>
  </div>;
}
