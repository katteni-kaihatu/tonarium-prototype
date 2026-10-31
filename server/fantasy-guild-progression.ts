import { fantasyQuestInstitution } from '../shared/fantasy-institutions.ts';
import type { FantasyProfile } from '../shared/fantasy.ts';
import { FANTASY_QUESTS } from '../shared/fantasy-data.ts';
import { fantasyEscortGrade, fantasyQuestGrade } from '../shared/fantasy-quest-grades.ts';
import { FANTASY_GUILD_PROMOTION_QUESTS, fantasyGuildProgress, fantasyCanRegisterGuild } from '../shared/fantasy-guild-progression.ts';
import { fantasyEscortPair, fantasyEscortTerms } from '../shared/fantasy-escort.ts';

/** 検証済みサーバー処理の保存直前だけに適用する。 */
export function recordFantasyGuildCompletions(before: FantasyProfile, after: FantasyProfile): boolean {
  const prior = before.character, current = after.character;
  if (!prior || !current || before.death || after.death || prior.lifeStartedAt !== current.lifeStartedAt) return false;
  if (!fantasyCanRegisterGuild(prior) || !fantasyCanRegisterGuild(current)) return false;
  const added = current.completed.filter(id => !prior.completed.includes(id));
  const progress = fantasyGuildProgress(prior);
  const credited = new Set(progress.creditedQuests);
  let changed = false;
  for (const id of added) {
    const quest = FANTASY_QUESTS.find(quest => quest.id === id);
    if (!quest || fantasyQuestInstitution(quest)!=='guild' || !prior.guildProgress || !prior.quests.includes(id) || current.quests.includes(id) || credited.has(id)) continue;
    credited.add(id); changed = true;
    if (fantasyQuestGrade(quest) === progress.grade) progress.completedAtGrade = Math.min(FANTASY_GUILD_PROMOTION_QUESTS, progress.completedAtGrade + 1);
  }
  const escort = prior.escort;
  if (escort && !current.escort && current.location === escort.destination) {
    const pair = fantasyEscortPair(escort.from, escort.destination), finishedAt = current.escortHistory?.[pair];
    const terms = fantasyEscortTerms(escort.from, escort.destination), receipt = `escort:${escort.id}`;
    if (finishedAt !== undefined && finishedAt >= escort.acceptedAt && finishedAt !== prior.escortHistory?.[pair]
      && terms && escort.defense !== 'pending' && !credited.has(receipt)) {
      credited.add(receipt); changed = true;
      if (fantasyEscortGrade(terms.path, terms.hours) === progress.grade) progress.completedAtGrade = Math.min(FANTASY_GUILD_PROMOTION_QUESTS, progress.completedAtGrade + 1);
    }
  }
  if (changed) { progress.creditedQuests = [...credited]; current.guildProgress = progress; }
  return changed;
}
