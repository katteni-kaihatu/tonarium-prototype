export const FANTASY_PARTY_MAX_PLAYERS = 6;
export const FANTASY_PARTY_BALANCE_VERSION = 'provisional-1';
export type FantasyPartyEnemyRank = 'normal' | 'elite' | 'boss';

export interface FantasyPartyCombatRosterMember {
  playerId: string;
  kind: 'player' | 'npc' | 'summon';
  participation: 'engaged' | 'waiting' | 'spectator';
  hp: number;
}
export interface FantasyPartyCombatSnapshot {
  readonly version: 1;
  readonly balancePolicy: typeof FANTASY_PARTY_BALANCE_VERSION;
  readonly combatId: string;
  readonly wave: number;
  readonly participantIds: readonly string[];
}
export interface FantasyPartyCombatSnapshotInput {
  combatId: string;
  wave: number;
  roster: readonly FantasyPartyCombatRosterMember[];
}
export interface FantasyPartyEnemyBase {
  maxHp: number;
  damage: number;
  actionsPerRound: 1 | 2 | 3;
}
export interface FantasyPartyContribution {
  playerId: string;
  effectiveActions: number;
  activeRounds: number;
  exit: 'present' | 'incapacitated' | 'left';
}

const coefficients = (hp: number[], damage: number[]) => Object.freeze({ hp: Object.freeze(hp), damage: Object.freeze(damage) });
export const FANTASY_PARTY_SCALING = Object.freeze({
  normal: coefficients([1, 1.55, 2.05, 2.5, 2.9, 3.25], [1, 1.04, 1.08, 1.12, 1.16, 1.2]),
  elite: coefficients([1, 1.7, 2.35, 2.95, 3.5, 4], [1, 1.06, 1.12, 1.18, 1.24, 1.3]),
  boss: coefficients([1, 1.85, 2.65, 3.4, 4.1, 4.75], [1, 1.08, 1.16, 1.24, 1.32, 1.4]),
});

const identifier = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 160
  && value.trim() === value && !/[\u0000-\u001f\u007f]/u.test(value);
const waveNumber = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 1 && Number(value) <= 10_000;
function validateSnapshot(snapshot: FantasyPartyCombatSnapshot): void {
  if (!snapshot || typeof snapshot !== 'object' || snapshot.version !== 1 || snapshot.balancePolicy !== FANTASY_PARTY_BALANCE_VERSION || !identifier(snapshot.combatId) || !waveNumber(snapshot.wave)
    || Object.keys(snapshot).some(key => !['version', 'balancePolicy', 'combatId', 'wave', 'participantIds'].includes(key))
    || !Array.isArray(snapshot.participantIds) || snapshot.participantIds.length < 1 || snapshot.participantIds.length > FANTASY_PARTY_MAX_PLAYERS
    || snapshot.participantIds.some(id => !identifier(id)) || new Set(snapshot.participantIds).size !== snapshot.participantIds.length) {
    throw new TypeError('Invalid party combat snapshot');
  }
}

export function createFantasyPartyCombatSnapshot(input: FantasyPartyCombatSnapshotInput): FantasyPartyCombatSnapshot {
  if (!input || !identifier(input.combatId) || !waveNumber(input.wave) || !Array.isArray(input.roster)) throw new TypeError('Invalid party combat roster');
  const players = new Map<string, boolean>();
  for (const member of input.roster) {
    if (!member || !identifier(member.playerId) || !['player', 'npc', 'summon'].includes(member.kind)
      || !['engaged', 'waiting', 'spectator'].includes(member.participation) || !Number.isFinite(member.hp) || member.hp < 0) throw new TypeError('Invalid party combatant');
    if (member.kind !== 'player') continue;
    const eligible = member.participation === 'engaged' && member.hp > 0;
    // 同じ人の矛盾した状態を採用すると、接続順で難易度が変わる。
    if (players.has(member.playerId) && players.get(member.playerId) !== eligible) throw new TypeError('Conflicting player combat states');
    players.set(member.playerId, eligible);
  }
  const participantIds = [...players].filter(([, eligible]) => eligible).map(([id]) => id).sort();
  if (participantIds.length < 1 || participantIds.length > FANTASY_PARTY_MAX_PLAYERS) throw new RangeError('Combat requires one to six active living players');
  return Object.freeze({ version: 1, balancePolicy: FANTASY_PARTY_BALANCE_VERSION, combatId: input.combatId, wave: input.wave, participantIds: Object.freeze(participantIds) });
}

export function nextFantasyPartyCombatWave(previous: FantasyPartyCombatSnapshot, input: { completedWave: number; roster: readonly FantasyPartyCombatRosterMember[] }): FantasyPartyCombatSnapshot {
  validateSnapshot(previous);
  if (!input || input.completedWave !== previous.wave) throw new RangeError('The previous wave must be completed');
  return createFantasyPartyCombatSnapshot({ combatId: previous.combatId, wave: previous.wave + 1, roster: input.roster });
}

export function fantasyPartyCombatScale(snapshot: FantasyPartyCombatSnapshot, rank: FantasyPartyEnemyRank) {
  validateSnapshot(snapshot);
  if (!Object.hasOwn(FANTASY_PARTY_SCALING, rank)) throw new TypeError('Invalid enemy rank');
  const count = snapshot.participantIds.length, row = FANTASY_PARTY_SCALING[rank];
  return Object.freeze({ policy: snapshot.balancePolicy, players: count, rank, hpMultiplier: row.hp[count - 1], damageMultiplier: row.damage[count - 1], enemyActionMultiplier: 1 as const });
}

export function scaleFantasyPartyEnemy(base: FantasyPartyEnemyBase, snapshot: FantasyPartyCombatSnapshot, rank: FantasyPartyEnemyRank): Readonly<FantasyPartyEnemyBase> {
  const scale = fantasyPartyCombatScale(snapshot, rank);
  if (!base || !Number.isSafeInteger(base.maxHp) || base.maxHp < 1 || !Number.isSafeInteger(base.damage) || base.damage < 0
    || ![1, 2, 3].includes(base.actionsPerRound)) throw new TypeError('Invalid base enemy stats');
  const maxHp = Math.ceil(base.maxHp * scale.hpMultiplier), damage = Math.round(base.damage * scale.damageMultiplier);
  if (!Number.isSafeInteger(maxHp) || !Number.isSafeInteger(damage)) throw new RangeError('Scaled enemy stats exceed the safe range');
  return Object.freeze({ maxHp, damage, actionsPerRound: base.actionsPerRound });
}

export function fantasyPartyRewardEligibility(snapshot: FantasyPartyCombatSnapshot, input: {
  outcome: 'victory' | 'defeat' | 'withdrawal'; totalRounds: number; contributions: readonly FantasyPartyContribution[];
}): readonly string[] {
  validateSnapshot(snapshot);
  if (!input || !['victory', 'defeat', 'withdrawal'].includes(input.outcome) || !Number.isSafeInteger(input.totalRounds) || input.totalRounds < 1
    || !Array.isArray(input.contributions)) throw new TypeError('Invalid party participation record');
  const records = new Map<string, FantasyPartyContribution>();
  for (const record of input.contributions) {
    if (!record || !identifier(record.playerId) || records.has(record.playerId) || !Number.isSafeInteger(record.effectiveActions) || record.effectiveActions < 0
      || !Number.isSafeInteger(record.activeRounds) || record.activeRounds < 0 || record.activeRounds > input.totalRounds
      || !['present', 'incapacitated', 'left'].includes(record.exit)) throw new TypeError('Invalid party contribution');
    records.set(record.playerId, record);
  }
  if (input.outcome !== 'victory') return Object.freeze([]);
  // 戦闘中に倒れた貢献者を、生存して待っただけの人より不利にしない。
  return Object.freeze(snapshot.participantIds.filter(id => {
    const record = records.get(id);
    return !!record && record.effectiveActions > 0 && record.activeRounds > 0
      && (record.exit === 'incapacitated' || record.activeRounds >= Math.ceil(input.totalRounds / 2));
  }));
}
