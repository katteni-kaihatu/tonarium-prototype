import type { FantasyCharacter, FantasyManaState, FantasySkill, FantasyStats, FantasyStat } from './fantasy.ts';
import type { NpcLocale } from './npc.ts';

type Names = Record<NpcLocale, string>;
type Exercise = 'sense' | 'circulate' | 'shape' | 'release' | 'refine';
type Character = Pick<FantasyCharacter, 'race' | 'mp' | 'fatigue' | 'mana'>;
const names = (ko: string, en: string, ja: string): Names => ({ ko, en, ja });
const AFFINITIES = ['balanced', 'flame', 'tide', 'gale', 'stone', 'light', 'shadow'] as const;

export const FANTASY_MANA_PRINCIPLES = [
  { id: 'sense', names: names('감응', 'Awareness', '感応'), description: names('주변과 몸 안의 마나 흐름을 알아차린다. 감응은 직업과 무관하게 배울 수 있다.', 'Notice mana around and within the body. Any profession can learn awareness.', '周囲と体内のマナの流れを感じる。職業を問わず学べる。') },
  { id: 'circulate', names: names('호흡과 기맥 순환', 'Breath and mana channels', '呼吸と気脈の循環'), description: names('기맥은 마나가 흐르는 길을 뜻한다. 호흡에 맞춰 순환시켜 근육과 감각을 보조한다.', 'Mana channels are the paths through which mana flows. Steady breathing supports muscles and senses.', '気脈はマナが流れる道。呼吸に合わせて循環させ、筋肉と感覚を補助する。') },
  { id: 'shape', names: names('형태 유지', 'Shaping', '形の維持'), description: names('마나의 흐름을 안정된 형태로 유지한다. 집중과 손기술을 훈련하며 새 힘을 저절로 만들어내지는 않는다.', 'Maintain a stable flow and shape through focus and control; this does not create energy freely.', '集中と制御でマナの形を保つ。力を無償で生み出す術ではない。') },
  { id: 'release', names: names('방출과 회수', 'Release and recovery', '放出と回収'), description: names('필요한 만큼만 방출하고 남은 흐름을 회수한다. 마나를 쓰면 MP가 소모되고 과부하가 쌓인다.', 'Release only what is needed and recover the remaining flow. Using mana consumes MP and builds strain.', '必要な分だけ放ち、残る流れを戻す。MPを消費し、負荷が蓄積する。') },
];

export interface FantasyManaExercise {
  id: Exercise; names: Names; hours: number; mpCost: number; dc: number; stat: FantasyStat; requiredStage: number;
}
export const FANTASY_MANA_EXERCISES: FantasyManaExercise[] = [
  { id: 'sense', names: names('첫 마나 감응', 'First mana awareness', '初めてのマナ感応'), hours: 1, mpCost: 0, dc: 10, stat: 'intelligence', requiredStage: 0 },
  { id: 'circulate', names: names('호흡 순환 수련', 'Circulation practice', '呼吸循環の修練'), hours: 2, mpCost: 2, dc: 12, stat: 'vitality', requiredStage: 1 },
  { id: 'shape', names: names('형태 유지 수련', 'Shaping practice', '形を保つ修練'), hours: 3, mpCost: 5, dc: 14, stat: 'intelligence', requiredStage: 2 },
  { id: 'release', names: names('방출과 회수 수련', 'Release practice', '放出と回収の修練'), hours: 2, mpCost: 8, dc: 15, stat: 'agility', requiredStage: 3 },
  { id: 'refine', names: names('마나 제어 다듬기', 'Refine mana control', 'マナ制御を磨く'), hours: 2, mpCost: 3, dc: 13, stat: 'intelligence', requiredStage: 1 },
];

function affinity(race: string): FantasyManaState['affinity'] {
  if (['dragonblood', 'fire-spirit', 'phoenix'].includes(race)) return 'flame';
  if (['tideborn', 'water-spirit', 'coralborn'].includes(race)) return 'tide';
  if (['birdkin', 'storm-dragonkin'].includes(race)) return 'gale';
  if (['dwarf', 'hill-dwarf', 'deep-dwarf', 'stoneborn', 'clockwork-golem'].includes(race)) return 'stone';
  if (['celestial', 'archangel', 'demigod'].includes(race)) return 'light';
  if (['moonshadow', 'revenant', 'vampire-night', 'vampire-crimson', 'vampire-moon', 'voidborn'].includes(race)) return 'shadow';
  return 'balanced';
}

export function validFantasyMana(character: Pick<FantasyCharacter, 'mana'>): boolean {
  if (character.mana === undefined) return true;
  const value = character.mana;
  return !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(key => ['stage', 'mastery', 'strain', 'affinity', 'useXp'].includes(key))
    && Number.isSafeInteger(value.stage) && value.stage >= 0 && value.stage <= 4
    && Number.isSafeInteger(value.mastery) && value.mastery >= 0 && value.mastery <= value.stage * 5
    && Number.isSafeInteger(value.strain) && value.strain >= 0 && value.strain <= 100 && AFFINITIES.includes(value.affinity)
    && (value.useXp === undefined || Number.isSafeInteger(value.useXp) && value.useXp >= 0 && value.useXp <= 1_000_000);
}

export function fantasyMana(character: Pick<FantasyCharacter, 'race' | 'mana'>): FantasyManaState {
  return character.mana && validFantasyMana(character) ? { ...character.mana } : { stage: 0, mastery: 0, strain: 0, affinity: affinity(character.race) };
}

export function fantasyManaTrainingError(character: Character, exercise: string): string | undefined {
  return 'マナは実際にMPを使い、効果が働いた経験で成長します。修練ボタンでは学べません。';
}

export const FANTASY_MANA_USE_THRESHOLDS = [0, 12, 40, 100, 240] as const;
export function fantasyManaOnUse(character: Pick<FantasyCharacter, 'race' | 'mana'>, mpSpent: number, multiplier = 1): FantasyManaState {
  const mana = fantasyMana(character);
  if (!Number.isFinite(mpSpent) || mpSpent <= 0 || !Number.isFinite(multiplier) || multiplier <= 0) return mana;
  const legacy = FANTASY_MANA_USE_THRESHOLDS[mana.stage];
  mana.useXp = Math.min(1_000_000, (mana.useXp ?? legacy) + Math.max(1, Math.floor(mpSpent * Math.min(1, multiplier))));
  const stage = FANTASY_MANA_USE_THRESHOLDS.reduce<number>((stage, threshold, index) => mana.useXp! >= threshold ? index : stage, 0);
  mana.stage = Math.max(mana.stage, stage) as FantasyManaState['stage'];
  mana.mastery = Math.min(mana.stage * 5, Math.max(mana.mastery, Math.floor(mana.useXp / 12)));
  return mana;
}

export interface FantasyManaTrainingResult { mana: FantasyManaState; mp: number; fatigue: number; hpDamage: number; xp: number; error?: string }
export function fantasyManaTrainingResult(character: Character, exercise: string, success: boolean): FantasyManaTrainingResult {
  const mana = fantasyMana(character);
  const error = fantasyManaTrainingError(character, exercise);
  return { mana, mp: character.mp, fatigue: character.fatigue, hpDamage: 0, xp: 0, error };
}

export function fantasyManaStatBonuses(character: Pick<FantasyCharacter, 'race' | 'mana'>): Partial<FantasyStats> {
  const mana = fantasyMana(character);
  return { mp: Math.min(20, mana.stage * 3 + Math.floor(mana.mastery / 5) * 2), strength: mana.stage >= 3 ? mana.stage === 4 ? 2 : 1 : 0,
    agility: mana.stage >= 3 ? 1 : 0, vitality: mana.stage >= 2 ? mana.stage === 4 ? 2 : 1 : 0 };
}

export function fantasyManaSkills(character: Pick<FantasyCharacter, 'race' | 'mana'>): FantasySkill[] {
  const mana = fantasyMana(character);
  if (mana.stage < 2) return [];
  const power = 2 + Math.floor(mana.mastery / 10);
  const skills: FantasySkill[] = (['strength', 'agility', 'vitality'] as const).map(stat => ({
    id: `mana-body-${stat}`, name: { strength: 'マナによる筋力強化', agility: 'マナによる敏捷強化', vitality: 'マナによる耐力強化' }[stat],
    kind: 'active', description: '呼吸と気脈の循環で、次の身体能力判定を補助する。負荷と疲労が増える。', mp: 5, effect: 'check', stat, power,
  }));
  if (mana.stage >= 3) skills.push({ id: 'mana-focus', name: 'マナ集中', kind: 'active', description: '流れを整え、次の知力判定を補助する。', mp: 5, effect: 'check', stat: 'intelligence', power: power + 1 });
  if (mana.stage >= 4) skills.push({ id: 'mana-ward', name: 'マナの護り', kind: 'active', description: '次に受ける被害を軽減する。', mp: 7, effect: 'guard', power: power + 2 });
  return skills;
}

export function fantasyManaSkillError(character: Character, skillId: string): string | undefined {
  if (skillId.startsWith('mana-') && !fantasyManaSkills(character).some(skill => skill.id === skillId)) return 'まだ習得していないマナ技能です。';
  if (fantasyMana(character).strain >= 80) return 'マナの負荷が高すぎます。休息して循環を落ち着かせてください。';
  return undefined;
}

export function fantasyManaAfterSkill(character: Character, skillId: string, mpSpent = 5): { mana: FantasyManaState; fatigue: number; hpDamage: number } {
  const mana = fantasyMana(character);
  if (fantasyManaSkillError(character, skillId)) return { mana, fatigue: character.fatigue, hpDamage: 0 };
  mana.strain = Math.min(100, mana.strain + Math.max(1, Math.ceil(mpSpent / 2)));
  return { mana, fatigue: Math.min(100, character.fatigue + Math.ceil(mpSpent / 5)), hpDamage: mana.strain >= 90 ? 3 : 0 };
}

export function fantasyManaRecover(character: Pick<FantasyCharacter, 'race' | 'mana'>, elapsedHours: number): FantasyManaState {
  const mana = fantasyMana(character);
  const elapsed = Number.isFinite(elapsedHours) ? Math.max(0, Math.floor(elapsedHours)) : 0;
  mana.strain = Math.max(0, mana.strain - Math.min(100, elapsed * 6));
  return mana;
}
