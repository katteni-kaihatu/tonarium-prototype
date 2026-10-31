import { FANTASY_FRONTIER_ENCOUNTERS } from './fantasy-frontier-data.ts';
import { fantasyHuntTargets } from './fantasy-gathering.ts';
import { fantasyProfessionGrade } from './fantasy-progression.ts';
import type { FantasyCharacter, FantasyProfile } from './fantasy.ts';
import { FANTASY_LOCATIONS, FANTASY_JOBS, FANTASY_QUESTS } from './fantasy-data.ts';
import { FANTASY_APEX_PROVOCATIONS, FANTASY_COMBAT_ENEMIES, fantasyCombatEnemy } from './fantasy-combat-catalog.ts';
import { fantasyMainStage } from './fantasy-main-trials.ts';
import { fantasyStoryCombatRequirement } from './fantasy-combat-stories.ts';
import { fantasyHostileEncounter, fantasyRegularCombatEnemy, FANTASY_ESCORT_AMBUSH_ENCOUNTER } from './fantasy-encounters.ts';
import { fantasyEnvironmentActionError } from './fantasy-environment.ts';
import { fantasyDungeonCombatPlan } from './fantasy-dungeon.ts';
import { fantasyMonsterSiteForProvocation } from './fantasy-monster-sites.ts';
import type { FantasyContractGrant } from './fantasy-contracts.ts';
export { fantasyRegularCombatEnemy } from './fantasy-encounters.ts';

export type FantasyCombatStartKind = 'hunt' | 'story' | 'encounter' | 'apex' | 'challenge' | 'escort' | 'dungeon' | 'guild';
export interface FantasyCombatStartPlan { source: string; enemies: { id: string; template: string; position?: 'front' | 'rear' }[]; victoryKey?: string }
const monsterId = (id: string | undefined) => id ? id.startsWith('monster-') ? id : `monster-${id}` : undefined;
const currentGrant = (c: FantasyCharacter, grant: FantasyContractGrant | undefined): grant is FantasyContractGrant => !!grant
  && /^offer-[a-z0-9-]{1,75}$/.test(grant.offerId) && FANTASY_LOCATIONS.some(place => place.id === grant.boardLocation)
  && Number.isFinite(grant.acceptedAt) && grant.acceptedAt >= 0 && grant.acceptedAt <= c.hour
  && Number.isFinite(grant.expiresAt) && grant.expiresAt > c.hour && Number.isSafeInteger(grant.progress) && grant.progress >= 0;
function acceptedHunts(c: FantasyCharacter) {
  return FANTASY_QUESTS.flatMap(quest => {
    if (quest.objective?.type !== 'hunt' || quest.destination !== c.location || !c.quests.includes(quest.id)) return [];
    const grant = c.contracts?.[quest.id] as FantasyContractGrant | undefined;
    if (!currentGrant(c, grant) || grant.progress >= quest.objective.count) return [];
    if (quest.group ? !Number.isFinite(grant.startsAt) || grant.startsAt! > c.hour || !Number.isFinite(grant.startedAt) || grant.startedAt! > c.hour : grant.startsAt !== undefined) return [];
    const enemy = fantasyCombatEnemy(monsterId(grant.monster ?? quest.objective.monster) ?? '');
    return enemy?.kind === 'monster' && enemy.tier <= 7 && !enemy.provocationOnly ? [{ quest, grant, enemy }] : [];
  });
}
function frontierHuntTargets(c: FantasyCharacter, matchPower = true) {
  const place = FANTASY_LOCATIONS.find(place => place.id === c.location);
  if (place?.land !== 'frontier') return [];
  const maximum = matchPower ? Math.max(4, Math.min(6, Number.isInteger(c.encounterTier) ? c.encounterTier! : 4)) : 6;
  return fantasyHuntTargets(c).filter(monster => FANTASY_FRONTIER_ENCOUNTERS[place.id]?.includes(monster.id) && monster.tier >= 4 && monster.tier <= maximum);
}
export function fantasyCombatHuntOptions(c: FantasyCharacter) {
  if (FANTASY_LOCATIONS.some(place => place.id === c.location && place.land === 'frontier')) {
    return frontierHuntTargets(c).flatMap(monster => {
      const enemy = fantasyCombatEnemy(monster.id);
      return enemy?.kind === 'monster' && !enemy.provocationOnly && enemy.tier >= 4 && enemy.tier <= 6 ? [enemy] : [];
    });
  }
  return [...new Map(acceptedHunts(c).map(entry => [entry.enemy.id, entry.enemy])).values()];
}
export function grantFantasyFrontierHuntLoot(c: FantasyCharacter, target: string): { meat: number; carcass?: FantasyCharacter['carcass'] } | undefined {
  // 勝利後の能力低下で、確定した獲物の回収を失わせない。
  const monster = frontierHuntTargets(c, false).find(monster => monster.id === target);
  const enemy = monster && fantasyCombatEnemy(monster.id);
  if (!monster || enemy?.kind !== 'monster' || enemy.provocationOnly || enemy.tier < 4 || enemy.tier > 6) return;
  const meat = monster.meat ?? 0;
  if (meat) c.inventory.meat = (c.inventory.meat ?? 0) + meat;
  if (monster.hide) c.carcass = { location: c.location, hour: c.hour, monster: monster.id, hide: monster.hide, count: Math.min(8, (monster.skinCount ?? 1) + fantasyProfessionGrade(c)) };
  return { meat, ...(monster.hide ? { carcass: c.carcass } : {}) };
}
export function fantasyCombatHumanOptions(c: FantasyCharacter) {
  const place = FANTASY_LOCATIONS.find(place => place.id === c.location);
  if (!place) return [];
  return FANTASY_COMBAT_ENEMIES.filter(enemy => enemy.kind === 'human' && enemy.kinds.includes(place.kind) && place.danger >= (enemy.minDanger ?? 0));
}
export function fantasyCombatStartPlan(profile: FantasyProfile, kind: FantasyCombatStartKind, target: string): FantasyCombatStartPlan | undefined {
  const c = profile.character;
  if (!c || typeof target !== 'string') return undefined;
  if (kind === 'dungeon') return fantasyDungeonCombatPlan(c, target);
  if (c.dungeon?.active) return undefined;
  if (kind === 'escort') return fantasyEscortCombatPlan(profile, target);
  if (kind === 'encounter' && target === FANTASY_ESCORT_AMBUSH_ENCOUNTER && profile.event === target) return fantasyEscortCombatPlan(profile, c.escort?.id);
  if (kind === 'guild') {
    const quest = FANTASY_QUESTS.find(quest => quest.group && quest.objective?.type === 'hunt' && quest.destination === c.location
      && c.quests.includes(quest.id) && c.contracts?.[quest.id]?.offerId === target);
    const grant = quest && c.contracts?.[quest.id] as FantasyContractGrant | undefined;
    const enemy = grant?.monster && fantasyCombatEnemy(monsterId(grant.monster)!);
    if (!quest || !currentGrant(c, grant) || !enemy || enemy.kind !== 'monster' || enemy.tier > 7 || enemy.provocationOnly
      || !Number.isFinite(grant.startsAt) || grant.startsAt! > c.hour
      || !Number.isFinite(grant.startedAt) || Math.abs(grant.startedAt! - c.hour) > 1e-8
      || !Number.isInteger(grant.enemyCount) || grant.enemyCount! < 1 || grant.enemyCount! > 6 || quest.objective!.count <= grant.progress) return undefined;
    const enemyCount = Math.min(6, grant.enemyCount!, quest.objective!.count - grant.progress);
    return { source: `guild:${target}`, enemies: Array.from({ length: enemyCount }, (_, index) => ({ id: `enemy-${index + 1}`, template: enemy.id, position: 'front' as const })) };
  }
  let enemy: string | undefined, source = `${kind}:${target}`;
  let enemyCount = 1;
  if (kind === 'hunt') {
    if (FANTASY_LOCATIONS.some(place => place.id === c.location && place.land === 'frontier')) {
      enemy = fantasyCombatHuntOptions(c).find(entry => entry.id === monsterId(target))?.id;
      if (enemy) source = `hunt:${enemy}`;
    } else {
      const hunt = acceptedHunts(c).find(entry => entry.enemy.id === monsterId(target));
      if (hunt) { enemy = hunt.enemy.id; source = `hunt:${enemy}`; enemyCount = Math.min(6, hunt.quest.objective!.count - hunt.grant.progress); }
    }
  }
  // Person battles come from the current encounter or a story scene, never a free challenge target.
  if (kind === 'challenge') return undefined;
  if (kind === 'apex' && !fantasyCombatWarningError(c, target)) enemy = FANTASY_APEX_PROVOCATIONS.find(action => action.id === target && action.location === c.location)?.enemy;
  if (kind === 'story') {
    const stage = fantasyMainStage(c, target), combat = stage && fantasyStoryCombatRequirement(c, target, stage.id);
    if (combat && stage?.location === c.location) {
      const narrative = fantasyCombatEnemy(combat.enemy);
      enemy = narrative && narrative.tier <= 6 ? narrative.id : fantasyRegularCombatEnemy(c, combat.key, narrative?.kind === 'human' ? 'person' : 'monster')?.id;
      source = combat.key;
    }
  }
  if (kind === 'encounter' && profile.event === target) {
    const encounter = fantasyHostileEncounter(target);
    if (encounter) enemy = fantasyRegularCombatEnemy(c, target, encounter.opponent)?.id;
  }
  const template = enemy && fantasyCombatEnemy(enemy);
  if (!template || template.provocationOnly && kind !== 'apex') return undefined;
  return { source, enemies: Array.from({ length: enemyCount }, (_, index) => ({ id: `enemy-${index + 1}`, template: template.id, position: 'front' as const })), ...(kind === 'story' ? { victoryKey: source } : {}) };
}
/** 護衛契約の馬車を守る戦闘。出発前の路確保と移動中の襲撃を同じ計画にまとめる。 */
function fantasyEscortCombatPlan(profile: FantasyProfile, contractId: string | undefined): FantasyCombatStartPlan | undefined {
  const c = profile.character, contract = c?.escort;
  if (!c || !contract || !contractId || contract.id !== contractId || contract.from !== c.location) return undefined;
  const beforeDeparture = contract.defense === 'pending' && !profile.activity && !profile.event;
  if (!beforeDeparture && profile.event !== FANTASY_ESCORT_AMBUSH_ENCOUNTER) return undefined;
  const template = fantasyRegularCombatEnemy(c, `escort:${contract.id}`, 'person');
  return template ? { source: `escort:${contract.id}`, enemies: [{ id: 'road-ambusher', template: template.id, position: 'front' }] } : undefined;
}
export function fantasyCombatStartError(profile: FantasyProfile, kind: FantasyCombatStartKind, target: string, confirmed = false): string | undefined {
  const c = profile.character;
  if (!c || profile.death || c.hp <= 0) return '生きている人物で戦闘に参加してください。';
  if (profile.combatId) return 'すでに戦闘中です。';
  if (profile.character?.returnLantern || profile.activity || profile.event && !(kind === 'encounter' && target === profile.event) && !(kind === 'escort' && fantasyCombatStartPlan(profile, 'escort', target))) return '現在の行動や出来事を先に終えてください。';
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
  const site = fantasyMonsterSiteForProvocation(id);
  if (!site || !c.monsterSites?.includes(site.id) || site.location !== c.location || !FANTASY_APEX_PROVOCATIONS.some(action => action.id === id && action.location === c.location) || !c.visited.includes(c.location)) return 'この場所にはその危険の兆しがありません。';
  return undefined;
}
export function validFantasyCombatProgress(c: FantasyCharacter): boolean {
  if (c.combatStoryVersion !== undefined && c.combatStoryVersion !== 1) return false;
  if (c.combatVictories !== undefined && (!c.combatVictories || typeof c.combatVictories !== 'object' || Array.isArray(c.combatVictories)
    || Object.entries(c.combatVictories).length > 300 || !Object.entries(c.combatVictories).every(([key, hour]) => {
      const ordinary = /^(story:main-night-\d{2}:(?:field|verify|compare)|hunt:monster-[a-z-]+|apex:[a-z-]+|challenge:human-[a-z-]+|encounter:[a-z-]+|escort:escort-[a-z0-9-]+|guild:offer-[a-z0-9-]+|dungeon:[a-z0-9-]+:[a-z0-9-]+)$/.test(key);
      const service = /^service:combat-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(key)
        && c.priestGrowth?.support?.some(entry => entry.battle === key.slice('service:'.length) && entry.hour === hour);
      return (ordinary || service) && Number.isFinite(hour) && hour >= (c.lifeStartedAt ?? 0) && hour <= c.hour;
    }))) return false;
  if (c.honors !== undefined && (!Array.isArray(c.honors) || c.honors.length > 20 || new Set(c.honors).size !== c.honors.length || !c.honors.every(id => typeof id === 'string' && FANTASY_COMBAT_ENEMIES.some(enemy => enemy.reward.honor?.id === id)))) return false;
  if (c.apexWarnings !== undefined && (!c.apexWarnings || typeof c.apexWarnings !== 'object' || Array.isArray(c.apexWarnings) || Object.keys(c.apexWarnings).length > FANTASY_APEX_PROVOCATIONS.length
    || !Object.entries(c.apexWarnings).every(([id, warning]) => !!warning && typeof warning === 'object' && !Array.isArray(warning) && Object.keys(warning).length === 2 && FANTASY_APEX_PROVOCATIONS.some(action => action.id === id && action.location === warning.location) && Number.isFinite(warning.hour) && warning.hour >= (c.lifeStartedAt ?? 0) && warning.hour <= c.hour))) return false;
  return true;
}
export const fantasyCombatChallengeIsCrime = (target: string) => ['human-watch-patrol', 'human-order-knight'].includes(target);
export const fantasyCombatHasCrimeProfession = (c: FantasyCharacter) => FANTASY_JOBS.some(job => job.id === c.job && job.category === 'crime');
