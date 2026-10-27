import type { FantasyCharacter, FantasyProfile } from './fantasy.ts';
import { FANTASY_LOCATIONS, FANTASY_JOBS } from './fantasy-data.ts';
import { FANTASY_SETTLEMENTS } from './fantasy-town.ts';
import { FANTASY_APEX_PROVOCATIONS, FANTASY_COMBAT_ENEMIES, fantasyCombatEnemy } from './fantasy-combat-catalog.ts';
import { fantasyMainStage } from './fantasy-main-trials.ts';
import { fantasyStoryCombatRequirement } from './fantasy-combat-stories.ts';
import { fantasyHostileEncounter } from './fantasy-encounters.ts';
import { fantasyEnvironmentActionError } from './fantasy-environment.ts';

export type FantasyCombatStartKind = 'hunt' | 'story' | 'encounter' | 'apex' | 'challenge' | 'escort';
export interface FantasyCombatStartPlan { source: string; enemies: { id: string; template: string; position?: 'front' | 'rear' }[]; victoryKey?: string }
export function fantasyCombatHuntOptions(c: FantasyCharacter) {
  const place = FANTASY_LOCATIONS.find(place => place.id === c.location);
  if (!place || FANTASY_SETTLEMENTS[place.id] || ['city', 'tower'].includes(place.kind)) return [];
  return FANTASY_COMBAT_ENEMIES.filter(enemy => enemy.kind === 'monster' && !enemy.provocationOnly && enemy.kinds.includes(place.kind) && place.danger >= (enemy.minDanger ?? 0));
}
export function fantasyCombatHumanOptions(c: FantasyCharacter) {
  const place = FANTASY_LOCATIONS.find(place => place.id === c.location);
  if (!place) return [];
  return FANTASY_COMBAT_ENEMIES.filter(enemy => enemy.kind === 'human' && enemy.kinds.includes(place.kind) && place.danger >= (enemy.minDanger ?? 0));
}
export function fantasyCombatStartPlan(profile: FantasyProfile, kind: FantasyCombatStartKind, target: string): FantasyCombatStartPlan | undefined {
  const c = profile.character;
  if (!c || typeof target !== 'string') return undefined;
  let enemy: string | undefined, source = `${kind}:${target}`;
  if (kind === 'hunt') enemy = fantasyCombatHuntOptions(c).find(enemy => enemy.id === target)?.id;
  if (kind === 'challenge') enemy = fantasyCombatHumanOptions(c).find(enemy => enemy.id === target)?.id;
  if (kind === 'apex') enemy = FANTASY_APEX_PROVOCATIONS.find(action => action.id === target && action.location === c.location)?.enemy;
  if (kind === 'story') {
    const stage = fantasyMainStage(c, target), combat = stage && fantasyStoryCombatRequirement(c, target, stage.id);
    if (combat && stage?.location === c.location) { enemy = combat.enemy; source = combat.key; }
  }
  if (kind === 'encounter' && profile.event === target) {
    const encounter = fantasyHostileEncounter(target);
    if (encounter) enemy = encounter.opponent === 'person'
      ? /guard|watch|patrol/.test(target) ? 'human-watch-patrol' : 'human-road-bandit'
      : /wolf/.test(target) ? 'monster-forest-wolf' : /skeleton/.test(target) ? 'monster-skeleton-guard' : /reef|crab/.test(target) ? 'monster-reef-crab' : 'monster-goblin-raider';
  }
  const template = enemy && fantasyCombatEnemy(enemy);
  if (!template || template.provocationOnly && kind !== 'apex') return undefined;
  return { source, enemies: [{ id: 'enemy-1', template: template.id, position: 'front' }], ...(kind === 'story' ? { victoryKey: source } : {}) };
}
export function fantasyCombatStartError(profile: FantasyProfile, kind: FantasyCombatStartKind, target: string, confirmed = false): string | undefined {
  const c = profile.character;
  if (!c || profile.death || c.hp <= 0) return '生きている人物で戦闘に参加してください。';
  if (profile.combatId) return 'すでに戦闘中です。';
  if (profile.activity || profile.event && !(kind === 'encounter' && target === profile.event)) return '現在の行動や出来事を先に終えてください。';
  if (!fantasyCombatStartPlan(profile, kind, target)) return 'ここではその相手と戦えません。';
  const dark = fantasyEnvironmentActionError(c, { type: 'hunt' });
  if (dark && kind !== 'encounter') return dark;
  if ((kind === 'challenge' || kind === 'apex') && confirmed !== true) return '危険を確認してから挑んでください。';
  if (kind === 'apex') {
    const defeated = c.combatVictories?.[`apex:${target}`];
    if (defeated !== undefined && c.hour - defeated < 24) return 'この強敵はまだ再戦に応じません。';
    const warning = c.apexWarnings?.[target];
    if (!warning || warning.location !== c.location || warning.hour > c.hour || c.hour - warning.hour > 1) return 'この場所で危険の兆しを先に調べてください。';
  }
  return undefined;
}
export function fantasyCombatWarningError(c: FantasyCharacter, id: string): string | undefined {
  if (!FANTASY_APEX_PROVOCATIONS.some(action => action.id === id && action.location === c.location) || !c.visited.includes(c.location)) return 'この場所にはその危険の兆しがありません。';
  return undefined;
}
export function validFantasyCombatProgress(c: FantasyCharacter): boolean {
  if (c.combatStoryVersion !== undefined && c.combatStoryVersion !== 1) return false;
  if (c.combatVictories !== undefined && (!c.combatVictories || typeof c.combatVictories !== 'object' || Array.isArray(c.combatVictories)
    || Object.entries(c.combatVictories).length > 300 || !Object.entries(c.combatVictories).every(([key, hour]) => /^(story:main-night-\d{2}:(?:field|verify|compare)|hunt:monster-[a-z-]+|apex:[a-z-]+|challenge:human-[a-z-]+|encounter:[a-z-]+|escort:escort-[a-z0-9-]+)$/.test(key) && Number.isFinite(hour) && hour >= (c.lifeStartedAt ?? 0) && hour <= c.hour))) return false;
  if (c.honors !== undefined && (!Array.isArray(c.honors) || c.honors.length > 20 || new Set(c.honors).size !== c.honors.length || !c.honors.every(id => typeof id === 'string' && FANTASY_COMBAT_ENEMIES.some(enemy => enemy.reward.honor?.id === id)))) return false;
  if (c.apexWarnings !== undefined && (!c.apexWarnings || typeof c.apexWarnings !== 'object' || Array.isArray(c.apexWarnings) || Object.keys(c.apexWarnings).length > FANTASY_APEX_PROVOCATIONS.length
    || !Object.entries(c.apexWarnings).every(([id, warning]) => !!warning && typeof warning === 'object' && !Array.isArray(warning) && Object.keys(warning).length === 2 && FANTASY_APEX_PROVOCATIONS.some(action => action.id === id && action.location === warning.location) && Number.isFinite(warning.hour) && warning.hour >= (c.lifeStartedAt ?? 0) && warning.hour <= c.hour))) return false;
  return true;
}
export const fantasyCombatChallengeIsCrime = (target: string) => ['human-watch-patrol', 'human-order-knight'].includes(target);
export const fantasyCombatHasCrimeProfession = (c: FantasyCharacter) => FANTASY_JOBS.some(job => job.id === c.job && job.category === 'crime');
