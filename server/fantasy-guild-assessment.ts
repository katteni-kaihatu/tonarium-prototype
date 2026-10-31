import type { FantasyProfile, FantasyResult } from '../shared/fantasy.ts';
import { FANTASY_ADVENTURER_POWER_THRESHOLDS, fantasyCombatPower, type FantasyAdventurerGrade, type FantasyGuildAssessmentError } from '../shared/fantasy-adventurer.ts';
import { FANTASY_GUILD_PROMOTION_QUESTS, fantasyGuildProgress, fantasyCanRegisterGuild } from '../shared/fantasy-guild-progression.ts';
import { fantasyFacilityOpen } from '../shared/fantasy-facility-hours.ts';
import { fantasyBuildings } from '../shared/fantasy-town.ts';
import { fantasyOnRoad } from '../shared/fantasy-travel.ts';
import { fantasyCombatPlayer } from './fantasy-combat-adapter.ts';

/** 呼び出し元で時刻を同期し、審査と受注情報を一緒に保存する。 */
export function assessFantasyGuildProfile(profile: FantasyProfile, hour: number): FantasyResult {
  const next = structuredClone(profile), c = next.character;
  const reject = (error: FantasyGuildAssessmentError): FantasyResult => ({ profile: next, changed: false, error });
  if (!Number.isFinite(hour) || hour < 0 || c && hour < c.hour - 1e-8) return reject('guild:invalid');
  if (!c || next.death || c.hp <= 0) return reject('guild:not-alive');
  if (!fantasyCanRegisterGuild(c)) return reject(c.job === 'priest' ? 'guild:profession' : 'guild:crime');
  if (next.activity || next.event || next.combatId || c.downed || c.carrying || c.returnLantern) return reject('guild:busy');
  if (fantasyOnRoad(c) || c.dungeon?.active || !fantasyBuildings(c).some(building => building.id === 'guild') || !fantasyFacilityOpen('guild', hour)) return reject('guild:guildOnly');
  const progress = fantasyGuildProgress(c);
  // 初回登録は必ずコッパー。以後は一段ずつ昇格する。
  if (c.guildProgress) {
    if (progress.grade === 8) return reject('guild:max-rank');
    if (progress.completedAtGrade < FANTASY_GUILD_PROMOTION_QUESTS) return reject('guild:quests-required');
  }
  c.hour=hour;
  const actor = fantasyCombatPlayer(next, 'assessment'),stats=actor.stats;
  const score = fantasyCombatPower(stats,actor);
  if (c.guildProgress) {
    if (score < FANTASY_ADVENTURER_POWER_THRESHOLDS[progress.grade]) return reject('guild:power-required');
    progress.grade = (progress.grade + 1) as FantasyAdventurerGrade;
    progress.completedAtGrade = 0;
  }
  c.guildProgress = progress;
  c.guildAssessment = { grade: progress.grade, score, assessedAt: hour };
  next.revision++;
  return { profile: next, changed: true };
}
