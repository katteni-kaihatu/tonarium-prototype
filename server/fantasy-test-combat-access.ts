import assert from 'node:assert/strict';
import { applyFantasyAction } from '../shared/fantasy-engine.ts';
import { FANTASY_QUESTS } from '../shared/fantasy-data.ts';
import { FANTASY_MONSTER_SITES } from '../shared/fantasy-monster-sites.ts';
import { NPC_PUBLIC } from '../shared/npc.ts';
import type { FantasyProfile } from '../shared/fantasy.ts';
import { fantasyCanRegisterGuild } from '../shared/fantasy-guild-progression.ts';

/** 登録可能だった時に受けた依頼を、現在の職業を保った戦闘用保存に用意する。 */
export function fantasyTestAcceptHunt(profile: FantasyProfile, monster = 'monster-forest-wolf'): FantasyProfile {
  const next = structuredClone(profile), c = next.character!, destination = c.location;
  const job=c.job,xp=structuredClone(c.jobXp),hp=c.hp,mp=c.mp;
  if(!fantasyCanRegisterGuild(c)){c.job='warrior';c.jobXp.warrior??=0;}
  c.guildProgress??={version:1,grade:1,completedAtGrade:0,creditedQuests:[]};
  const quest = FANTASY_QUESTS.find(q => !q.group && q.destination === destination && q.objective?.type === 'hunt' && q.objective.monster === monster);
  assert.ok(quest, `No registered hunt for ${monster} at ${destination}`);
  const issuer = NPC_PUBLIC.find(npc => npc.homeLocation === quest.giver); assert.ok(issuer);
  const offerId = `offer-fixture-${monster.slice(8)}`;
  c.location = quest.giver; c.visited = [...new Set([...c.visited, quest.giver])];
  const result = applyFantasyAction(next, { type: 'accept', quest: quest.id, offer: offerId }, () => .5, { contract: {
    offerId, issuer: issuer.id, boardLocation: quest.giver, acceptedAt: c.hour, expiresAt: c.hour + 36, progress: 0, gold: quest.gold,
    monster, enemyCount: quest.objective!.type === 'hunt' ? quest.objective!.count : 1,
  } });
  assert.equal(result.error, undefined); assert.ok(result.profile.character!.contracts?.[quest.id]);
  result.profile.character!.location = destination;
  result.profile.character!.job=job;result.profile.character!.jobXp=xp;result.profile.character!.hp=hp;result.profile.character!.mp=mp;
  return result.profile;
}

/** Discovery is performed through the real consumable action; inspection/confirmation remain separate. */
export function fantasyTestReadLocalMonsterMaps(profile: FantasyProfile): FantasyProfile {
  let next = profile;
  for (const site of FANTASY_MONSTER_SITES.filter(site => site.location === profile.character!.location)) {
    if (next.character!.monsterSites?.includes(site.id)) continue;
    next.character!.inventory[site.item] = 1;
    const result = applyFantasyAction(next, { type: 'use', item: site.item }, () => .5);
    assert.equal(result.error, undefined); assert.ok(result.profile.character!.monsterSites?.includes(site.id)); next = result.profile;
  }
  return next;
}
