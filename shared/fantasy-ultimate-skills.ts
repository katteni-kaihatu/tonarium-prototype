import type { FantasyCharacter, FantasySkill, FantasyStat } from './fantasy.ts';
import type { FantasyCombatSkill } from './fantasy-combat.ts';
import type { NpcLocale } from './npc.ts';

type Names = [ko: string, en: string, ja: string];
type Text = Record<NpcLocale, string>;
const text = ([ko, en, ja]: Names): Text => ({ ko, en, ja });
export const FANTASY_ULTIMATE_JOB_XP = 600;
export interface FantasyUltimateAnimation {
  id: string;
  job: string;
  sigil: string;
  motif: 'cleave' | 'pierce' | 'volley' | 'impact' | 'nova' | 'ward' | 'rally' | 'shadow';
  color: string;
  glyph: string;
  durationMs: number;
}
export interface FantasyUltimateTechnique {
  job: string;
  skill: FantasySkill;
  combat: FantasyCombatSkill;
  animation: FantasyUltimateAnimation;
}
type Art = Omit<FantasyCombatSkill, 'id' | 'names'>;
function technique(job: string, slug: string, names: Names, book: string, stat: FantasyStat, art: Art,
  motif: FantasyUltimateAnimation['motif'], color: string, glyph: string): FantasyUltimateTechnique {
  const id = `ultimate-${job}-${slug}`, title = text(names);
  const attack = art.kind === 'attack', ward = art.kind === 'guard';
  const outsidePower = attack ? 7 : ward ? 16 : 7;
  const combatText = attack
    ? text([`전투: ${art.magic ? '마법' : '물리'} 공격 위력 +${art.power}, 사거리 ${art.reach ?? 1}.`, `Combat: ${art.magic ? 'magic' : 'physical'} attack power +${art.power}, reach ${art.reach ?? 1}.`, `戦闘: ${art.magic ? '魔法' : '物理'}攻撃補正+${art.power}、射程${art.reach ?? 1}。`])
    : ward ? text([`전투: 살아 있는 아군 1명에게 이번 라운드 방호 ${art.power}.`, `Combat: give one living ally ward ${art.power} for this round.`, `戦闘: 生存中の味方1人にこのラウンド防護${art.power}。`])
      : text([`전투: 살아 있는 아군 1명의 다음 공격 명중 +${art.power}. 2라운드 안에 한 번, 중첩 불가.`, `Combat: one living ally gains +${art.power} aim for one attack within two rounds; does not stack.`, `戦闘: 生存中の味方1人の次の攻撃命中+${art.power}。2ラウンド以内に1回、重複不可。`]);
  const descriptions = text([
    `직업 숙련 ${FANTASY_ULTIMATE_JOB_XP}과 관련 서적 독서로 익히는 비전. ${combatText.ko} 전투 밖에서는 ${ward ? `다음 피해를 ${outsidePower} 줄인다` : `다음 관련 능력 판정 +${outsidePower}`}. MP ${art.mp}.`,
    `A secret art learned from its field book and ${FANTASY_ULTIMATE_JOB_XP} profession XP. ${combatText.en} Outside combat, ${ward ? `reduce the next damage by ${outsidePower}` : `gain +${outsidePower} on the next relevant ability check`}. MP ${art.mp}.`,
    `関連書の読了と職業熟練${FANTASY_ULTIMATE_JOB_XP}で習得する奥義。${combatText.ja}戦闘外では${ward ? `次の被害を${outsidePower}軽減` : `次の対応能力判定+${outsidePower}`}。MP${art.mp}。`,
  ]);
  return {
    job,
    skill: { id, name: title.ja, names: title, kind: 'active', mp: art.mp, effect: ward ? 'guard' : 'check', power: outsidePower,
      ...(ward ? {} : { stat }), description: descriptions.ja, descriptions, unlock: { kind: 'book', book, jobXp: FANTASY_ULTIMATE_JOB_XP } },
    combat: { ...art, id, names: title, visualTier: 4 },
    animation: { id, job, sigil: `${job}-${slug}`, motif, color, glyph,
      durationMs: ['mage', 'summoner'].includes(job) ? 2400 : ['bard', 'leader', 'crimeboss'].includes(job) ? 2200 : 1900 },
  };
}
const melee = (power: number, mp: number, extra: Partial<Art> = {}): Art => ({ kind: 'attack', magic: false, range: 'melee', power, mp, reach: 1, damageType: 'pierce', ...extra });
const ranged = (power: number, mp: number, extra: Partial<Art> = {}): Art => ({ kind: 'attack', magic: false, range: 'ranged', power, mp, reach: 7, damageType: 'pierce', ...extra });
const guard = (power: number, mp: number): Art => ({ kind: 'guard', magic: false, range: 'melee', power, mp, reach: 2 });
const focus = (mp: number): Art => ({ kind: 'focus', magic: false, range: 'ranged', power: 12, mp, reach: 5 });

export const FANTASY_ULTIMATE_TECHNIQUES: readonly FantasyUltimateTechnique[] = [
  technique('adventurer', 'horizon', ['지평선 돌파', 'Horizon Break', '地平突破'], 'field-signs', 'strength', melee(28, 24, { shape: 'line', reach: 3, secondaryDamage: 65 }), 'pierce', '#f5bd62', '✧'),
  technique('warrior', 'sundering-arc', ['천지 가르기', 'Sundering Arc', '天地断ち'], 'martial-practice', 'strength', melee(34, 28, { shape: 'fan', reach: 2, secondaryDamage: 75 }), 'cleave', '#ff986b', '⚔'),
  technique('knight', 'unbroken-vow', ['불멸의 서약', 'Unbroken Vow', '不滅の誓い'], 'martial-practice', 'vitality', guard(62, 28), 'ward', '#f6df93', '♜'),
  technique('spearfighter', 'dragon-piercer', ['용맥 관통', 'Dragonline Piercer', '竜脈貫き'], 'martial-practice', 'strength', melee(32, 26, { shape: 'line', reach: 4, secondaryDamage: 70 }), 'pierce', '#e8bf6d', '⟡'),
  technique('pugilist', 'mountain-fall', ['태산 붕격', 'Mountainfall Fist', '泰山崩拳'], 'martial-practice', 'strength', melee(38, 28, { damageType: 'blunt', hitUtility: { id: 'weaken', power: 3, chance: .5 } }), 'impact', '#efac72', '✊'),
  technique('shieldbearer', 'last-bastion', ['최후의 성채', 'Last Bastion', '最後の砦'], 'martial-practice', 'vitality', guard(74, 32), 'ward', '#90c6eb', '⬡'),
  technique('archer', 'skyfall', ['하늘비 화살', 'Skyfall Volley', '天雨の矢'], 'martial-practice', 'agility', ranged(28, 28, { shape: 'burst', radius: 1, secondaryDamage: 65 }), 'volley', '#b4dc8a', '➶'),
  technique('hunter', 'perfect-quarry', ['추적의 종착점', 'The Hunt’s End', '追跡の終着'], 'field-signs', 'agility', ranged(36, 26, { hitBonus: 8 }), 'pierce', '#bdcd84', '◎'),
  technique('ranger', 'forest-rain', ['숲의 화살비', 'Forest Arrow Rain', '森の矢雨'], 'field-signs', 'agility', ranged(27, 26, { shape: 'fan', reach: 5, secondaryDamage: 60 }), 'volley', '#66d9a0', '❧'),
  technique('scout', 'storm-trail', ['폭풍의 발자취', 'Storm Trail', '嵐の足跡'], 'field-signs', 'agility', melee(27, 24, { shape: 'line', reach: 4, secondaryDamage: 60, motion: { kind: 'dash', distance: 4 } }), 'pierce', '#7edce5', '↯'),
  technique('spellblade', 'severed-star', ['별빛 단절', 'Star-Sundering Blade', '星断ちの刃'], 'advanced-mana-forms', 'strength', melee(34, 30, { shape: 'cone', reach: 2, secondaryDamage: 70, hitUtility: { id: 'silence', power: 2, chance: .35 } }), 'cleave', '#c0a2ff', '✦'),
  technique('mage', 'falling-constellation', ['낙성 대술식', 'Falling Constellation', '落星大術式'], 'advanced-mana-forms', 'intelligence', { kind: 'attack', magic: true, range: 'magic', power: 44, mp: 38, shape: 'burst', reach: 7, radius: 2, secondaryDamage: 65, damageType: 'none' }, 'nova', '#a9baff', '✺'),
  technique('summoner', 'covenant-star', ['계약의 별', 'Covenant Star', '契約の星'], 'advanced-mana-forms', 'intelligence', { kind: 'guard', magic: true, range: 'magic', power: 58, mp: 30, reach: 6 }, 'ward', '#b6a7f4', '✡'),
  technique('bard', 'heroic-finale', ['영웅의 종장', 'Heroic Finale', '英雄の終章'], 'words-and-promises', 'charisma', focus(24), 'rally', '#f1a8d2', '♫'),
  technique('leader', 'victory-standard', ['승리의 깃발', 'Victory Standard', '勝利の旗'], 'words-and-promises', 'charisma', focus(24), 'rally', '#f5cc7a', '⚑'),
  technique('thief', 'vanishing-edge', ['사라지는 칼끝', 'Vanishing Edge', '消える刃先'], 'shadow-and-risk', 'agility', melee(32, 26, { hitBonus: 6, hitUtility: { id: 'blind', power: 3, chance: .45 } }), 'shadow', '#c5b6ed', '◇'),
  technique('assassin', 'moonless-strike', ['무월의 일격', 'Moonless Strike', '無月の一撃'], 'shadow-and-risk', 'agility', melee(40, 30, { hitBonus: 6 }), 'shadow', '#b5a3d8', '☾'),
  technique('bandit', 'ravine-breaker', ['협곡 분쇄', 'Ravine Breaker', '峡谷砕き'], 'shadow-and-risk', 'strength', melee(32, 26, { shape: 'cone', reach: 2, secondaryDamage: 65, damageType: 'blunt' }), 'impact', '#cf966f', '◆'),
  technique('smuggler', 'hidden-harbor', ['숨겨진 항구', 'Hidden Harbor', '隠れ港'], 'shadow-and-risk', 'charisma', guard(48, 24), 'ward', '#93b4b7', '⚓'),
  technique('spy', 'decisive-signal', ['결정적 신호', 'Decisive Signal', '決め手の合図'], 'shadow-and-risk', 'intelligence', focus(24), 'shadow', '#a9c5d7', '⌖'),
  technique('crimeboss', 'final-command', ['최후의 지휘', 'Final Command', '最後の采配'], 'shadow-and-risk', 'charisma', focus(26), 'rally', '#bd91ae', '♛'),
];

const byId = new Map(FANTASY_ULTIMATE_TECHNIQUES.map(entry => [entry.skill.id, entry]));

export function fantasyUltimateJobSkills(job: string): FantasySkill[] {
  return FANTASY_ULTIMATE_TECHNIQUES.filter(entry => entry.job === job).map(entry => structuredClone(entry.skill));
}

export function fantasyIsUltimateSkill(id: string): boolean { return byId.has(id); }

export function fantasyUltimateWeaponReady(id: string, weapon: string): boolean {
  const job = byId.get(id)?.job;
  if (job && ['archer', 'hunter', 'ranger'].includes(job)) return /bow|crossbow/.test(weapon);
  if (job === 'spearfighter') return /spear|lance|pike|halberd|polearm/.test(weapon);
  if (job && ['thief', 'assassin', 'spellblade'].includes(job)) return /sword|blade|dagger/.test(weapon);
  if (job === 'warrior') return /sword|blade|axe|mace|hammer|halberd/.test(weapon);
  return true;
}

export function fantasyUltimateCombatSkill(id: string, skilledPower?: number): FantasyCombatSkill | undefined {
  const entry = byId.get(id);
  if (!entry) return undefined;
  const growth = skilledPower !== undefined && Number.isFinite(skilledPower) ? Math.min(3, Math.max(0, skilledPower - entry.skill.power)) : 0;
  const art = structuredClone(entry.combat);
  art.power = Math.min(art.kind === 'focus' ? 15 : 100, art.power + growth);
  return art;
}

export function fantasyUltimateAnimation(id: string): FantasyUltimateAnimation | undefined {
  const animation = byId.get(id)?.animation;
  return animation ? { ...animation } : undefined;
}

export function fantasyUltimateUnlocked(character: Pick<FantasyCharacter, 'job' | 'jobXp' | 'readBooks'>, id: string): boolean {
  const entry = byId.get(id), unlock = entry?.skill.unlock;
  return !!entry && entry.job === character.job && unlock?.kind === 'book'
    && (character.jobXp[entry.job] ?? 0) >= (unlock.jobXp ?? 0) && character.readBooks?.includes(unlock.book) === true;
}
