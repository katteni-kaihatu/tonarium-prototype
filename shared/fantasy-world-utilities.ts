import type { FantasyCharacter, FantasyProfile, FantasyResult, FantasySkill, FantasyStat } from './fantasy.ts';
import type { NpcLocale } from './npc.ts';
import { addFantasyEffect, fantasyActiveEffects, FANTASY_UTILITY_EFFECT_DEFINITIONS } from './fantasy-effects.ts';
import { FANTASY_JOBS, FANTASY_RACES } from './fantasy-data.ts';
import { fantasyPracticeMultiplier, grantFantasyPractice } from './fantasy-progression.ts';
import { fantasyManaOnUse } from './fantasy-mana.ts';

export type FantasyUtilityPractice = Record<string, { skill: string; mp: number; credited: boolean }>;
const utilitySource = (id: string, receipt: FantasyUtilityPractice[string]) => [...FANTASY_JOBS.flatMap(job => job.skills), ...FANTASY_RACES.flatMap(race => race.skills)]
  .find(skill => skill.id === receipt.skill && skill.kind === 'active' && `skill-${skill.utility}` === id && skill.mp === receipt.mp);

const messages = {
  battle: { ko: '이 술기는 전투에서 대상을 정해 사용해야 합니다.', en: 'This art needs a target during battle.', ja: 'この術は戦闘中に対象を選んで使ってください。' },
  active: { ko: '이 효과가 아직 이어지고 있습니다.', en: 'This effect is still active.', ja: 'この効果はまだ続いています。' },
  unavailable: { ko: '지금은 이 술기를 사용할 수 없습니다.', en: 'You cannot use this art now.', ja: '今はこの術を使えません。' },
  capacity: { ko: '더 많은 효과를 함께 유지할 수 없습니다.', en: 'You cannot sustain another effect.', ja: 'これ以上の効果を同時に保てません。' },
};
export function fantasyWorldUtilityError(c:FantasyCharacter,skill:FantasySkill):string|undefined{
  if(!skill.utility)return;
  if(c.hp<=0||c.downed||c.mp<skill.mp||skill.kind!=='active')return messages.unavailable.ja;
  const id=`skill-${skill.utility}`;
  if(!Object.hasOwn(FANTASY_UTILITY_EFFECT_DEFINITIONS,id))return messages.battle.ja;
  if(fantasyActiveEffects(c).some(effect=>effect.id===id))return messages.active.ja;
  if(!addFantasyEffect(structuredClone(c),{id,...FANTASY_UTILITY_EFFECT_DEFINITIONS[id as keyof typeof FANTASY_UTILITY_EFFECT_DEFINITIONS]}))return messages.capacity.ja;
}
export function applyFantasyWorldUtility(profile: FantasyProfile, skill: FantasySkill): FantasyResult | undefined {
  if (!skill.utility) return;
  const reject = (message: keyof typeof messages): FantasyResult => ({ profile, changed: false, error: messages[message].ja });
  const c = profile.character;
  if (!c || c.hp <= 0 || c.downed || profile.death || profile.combatId || skill.kind !== 'active' || c.mp < skill.mp) return reject('unavailable');
  const id = `skill-${skill.utility}`;
  if (!Object.hasOwn(FANTASY_UTILITY_EFFECT_DEFINITIONS, id)) return reject('battle');
  if (fantasyActiveEffects(c).some(effect => effect.id === id)) return reject('active');
  const next = structuredClone(profile), definition = FANTASY_UTILITY_EFFECT_DEFINITIONS[id as keyof typeof FANTASY_UTILITY_EFFECT_DEFINITIONS];
  if (!addFantasyEffect(next.character!, { id, ...definition })) return reject('capacity');
  (next.character!.utilityPractice ??= {})[id] = { skill: skill.id, mp: skill.mp, credited: false };
  return { profile: next, changed: true };
}
export function recordFantasyWorldUtilityUse(profile: FantasyProfile, kind: 'check' | 'guard' | 'regen', stat?: FantasyStat): boolean {
  const c = profile.character; if (!c || c.hp <= 0 || c.downed || profile.death) return false;
  const ids = kind === 'regen' ? ['skill-regen'] : kind === 'guard' ? ['skill-resolve'] : stat === 'agility' ? ['skill-haste'] : stat === 'intelligence' ? ['skill-clarity'] : [];
  let credited = false;
  for (const effect of kind === 'regen' ? c.effects ?? [] : fantasyActiveEffects(c)) {
    const receipt = c.utilityPractice?.[effect.id];
    if (!ids.includes(effect.id) || !receipt || receipt.credited) continue;
    const source = utilitySource(effect.id, receipt);
    if (!source) continue;
    receipt.credited = true;
    const key = `utility:${receipt.skill}`, multiplier = fantasyPracticeMultiplier(c, key);
    grantFantasyPractice(c, { key, amount: 4, success: true, skill: receipt.skill });
    if (receipt.mp > 0) c.mana = fantasyManaOnUse(c, receipt.mp, multiplier);
    credited = true;
  }
  return credited;
}
export function validFantasyUtilityPractice(c: FantasyCharacter): boolean {
  const records = c.utilityPractice; if (records === undefined) return true;
  if (!records || typeof records !== 'object' || Array.isArray(records) || Object.keys(records).length > Object.keys(FANTASY_UTILITY_EFFECT_DEFINITIONS).length) return false;
  return Object.entries(records).every(([id, receipt]) => Object.hasOwn(FANTASY_UTILITY_EFFECT_DEFINITIONS, id) && !!receipt && typeof receipt === 'object' && !Array.isArray(receipt) && Object.keys(receipt).length === 3
    && typeof receipt.credited === 'boolean' && !!utilitySource(id, receipt));
}
export function fantasyWorldUtilityText(source: string, locale: NpcLocale): string | undefined {
  return Object.values(messages).find(message => message.ja === source)?.[locale];
}
