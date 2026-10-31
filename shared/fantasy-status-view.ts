import type { FantasyCharacter, FantasyStats } from './fantasy.ts';
import type { NpcLocale } from './npc.ts';
import type { FantasyCombatFighter } from './fantasy-combat.ts';
import { fantasyActiveEffects } from './fantasy-effects.ts';
import { fantasyWeatherExposure, type FantasyWeatherContext } from './fantasy-environment.ts';
import { FANTASY_ITEMS, FANTASY_JOBS, FANTASY_RACES } from './fantasy-data.ts';
import { fantasyTravelEffectName } from './fantasy-travel-goods.ts';
import { fantasyCombatSkillBrief } from './fantasy-combat-preview.ts';

export interface FantasyStatusRow { id: string; name: string; description: string; kind: 'buff' | 'debuff' }
const words = (ko: string, en: string, ja: string) => ({ ko, en, ja });
const names = {
  poison: words('중독', 'Poison', '毒'), burn: words('화상', 'Burn', '火傷'), frost: words('냉기', 'Chill', '冷気'), weakness: words('쇠약', 'Weakness', '衰弱'),
  haste: words('신속', 'Haste', '迅速'), regen: words('재생', 'Regeneration', '再生'), clarity: words('명료', 'Clarity', '明晰'), thorns: words('반사', 'Thorns', '反射'), lifesteal: words('흡혈', 'Lifesteal', '吸収'), resolve: words('결의', 'Resolve', '決意'),
  weaken: words('약화', 'Weaken', '弱化'), vulnerable: words('취약', 'Vulnerable', '脆弱'), blind: words('시야 교란', 'Blind', '視界妨害'), bleed: words('출혈', 'Bleed', '出血'), root: words('속박', 'Root', '束縛'), silence: words('침묵', 'Silence', '沈黙'),
  'well-fed': words('식사 강화', 'Nourished', '食事の力'), 'gem-focus': words('보석 집중', 'Gem focus', '宝石の集中'), 'gem-ward': words('보석 수호', 'Gem ward', '宝石の守護'), 'gem-luck': words('보석 행운', 'Gem fortune', '宝石の幸運'),
};
const statNames: Record<keyof FantasyStats, ReturnType<typeof words>> = {
  hp: words('최대 HP', 'Maximum HP', '最大HP'), mp: words('최대 MP', 'Maximum MP', '最大MP'), strength: words('힘', 'Strength', '力'), agility: words('민첩', 'Agility', '敏捷'), intelligence: words('지능', 'Intelligence', '知性'), luck: words('운', 'Luck', '運'), vitality: words('체력', 'Vitality', '体力'), dexterity: words('재주', 'Dexterity', '器用'), charisma: words('카리스마', 'Charisma', 'カリスマ'),
};
const signed = (value: number) => `${value > 0 ? '+' : ''}${value}`;
const harmful = (id: string) => ['poison', 'burn', 'frost', 'weakness', 'weaken', 'vulnerable', 'blind', 'bleed', 'root', 'silence'].includes(id);
function name(id: string, locale: NpcLocale) {
  return fantasyTravelEffectName(id, locale) ?? names[id as keyof typeof names]?.[locale]
    ?? names[id.replace('skill-', '') as keyof typeof names]?.[locale]
    ?? FANTASY_ITEMS.find(item => item.use?.effect?.id === id)?.names?.[locale]
    ?? words('일시적 효과', 'Temporary effect', '一時効果')[locale];
}

export function fantasyStatusView(c: FantasyCharacter, locale: NpcLocale, context: FantasyWeatherContext & { fighter?: FantasyCombatFighter } = {}): FantasyStatusRow[] {
  const rows: FantasyStatusRow[] = [], say = (ko: string, en: string, ja: string) => words(ko, en, ja)[locale];
  const add = (id: string, title: string, description: string, kind: FantasyStatusRow['kind']) => rows.push({ id, name: title, description, kind });
  const exposure = fantasyWeatherExposure(c, context);
  for (const [key, value, label] of [
    ['cold', exposure.cold, say('추위', 'Cold exposure', '寒さ')], ['heat', exposure.heat, say('더위', 'Heat exposure', '暑さ')],
    ['rain', exposure.rain, say('젖음', 'Rain exposure', '雨濡れ')], ['darkness', exposure.darkness, say('어둠', 'Darkness', '暗闇')],
  ] as const) if (value > 0) add(`weather-${key}`, label, say(`야외 판정 -${value}. 환경 불이익은 합산 최대 -6.`, `Outdoor checks -${value}. Combined environmental penalties cap at -6.`, `屋外判定-${value}。環境の不利は合計で最大-6。`) + (key === 'darkness'
    ? exposure.light > 0 ? say(' 광원으로 일부 완화 중이다. 가장 밝은 휴대등도 사각지대까지 밝히지는 못한다.', 'A light offers partial relief. Even the brightest carried lamp leaves blind spots.', '灯りで一部軽減中。最も明るい携帯灯でも死角は残る。') : say(' 주변을 밝히는 광원이 없다.', 'No light illuminates the surroundings.', '周囲を照らす灯りがない。')
    : say(' 무방비 야영 시 피로 회복도 감소한다.', ' Unprotected camping also restores less fatigue.', ' 備えのない野営では疲労回復も減る。')), 'debuff');
  for (const [axis, needed, title] of [
    ['warmth', exposure.environment.temperature < 8, say('보온', 'Warmth', '保温')],
    ['cooling', exposure.environment.temperature >= 29, say('냉각', 'Cooling', '冷却')],
    ['waterproof', exposure.environment.weather === 'rain', say('비 차단', 'Rain shelter', '雨よけ')],
  ] as const) {
    const protection = exposure[axis];
    if (!exposure.indoors && needed && protection.value > 0) {
      const sources = [...protection.items.map(id => FANTASY_ITEMS.find(item => item.id === id)?.names?.[locale]), ...(axis === 'warmth' && context.camping && context.campfire ? [say('모닥불', 'Campfire', '焚き火')] : [])].filter(Boolean).join(', ');
      add(`protection-${axis}`, title, `${sources || title} · ${say('보호', 'Protection', '保護')} ${protection.value}. ${say('착용·휴대 중인 유효 장비만 적용. 같은 계열의 도구는 가장 강한 하나만 적용한다.', 'Only valid worn/carried gear applies. Only the strongest tool of each type applies.', '着用・携帯中の有効な装備のみ。同系統の道具は最も強い一つだけが働く。')}`, 'buff');
    }
  }
  for (const [key, value] of [['fatigue', c.fatigue], ['hunger', c.hunger]] as const) {
    const penalty = value >= 90 ? 3 : value >= 70 ? 2 : value >= 50 ? 1 : 0;
    if (penalty) add(key, key === 'fatigue' ? say('피로', 'Fatigue', '疲労') : say('허기', 'Hunger', '空腹'), say(`현재 ${Math.round(value)}/100 · 판정 -${penalty}.`, `Currently ${Math.round(value)}/100 · checks -${penalty}.`, `現在${Math.round(value)}/100・判定-${penalty}。`), 'debuff');
  }
  const fighter = context.fighter;
  for (const effect of fantasyActiveEffects(c)) {
    if (fighter?.effects.some(other => other.id === effect.id)) continue;
    const parts = Object.entries(effect.stats ?? {}).map(([stat, value]) => `${statNames[stat as keyof FantasyStats]?.[locale] ?? stat} ${signed(value)}`);
    if (effect.check) parts.push(`${say('판정', 'Checks', '判定')} ${signed(effect.check)}`);
    if (effect.guard) parts.push(`${say('방호', 'Guard', '防護')} +${effect.guard}`);
    if (effect.periodicHp) parts.push(say(`게임 1시간마다 HP ${signed(effect.periodicHp)}`, `HP ${signed(effect.periodicHp)} per game hour`, `ゲーム1時間ごとにHP ${signed(effect.periodicHp)}`));
    if (effect.diceFaces) parts.push(effect.diceFaces === 'lower' ? say('주사위 눈이 낮아짐', 'Lower dice faces', '出目が低くなる') : say('주사위 눈이 홀수로 바뀜', 'Odd dice faces', '出目が奇数になる'));
    if (effect.dicePenalty) parts.push(`${say('주사위 불이익', 'Dice penalty', 'ダイスの不利')} ${effect.dicePenalty}`);
    parts.push(say(`게임 ${Number((effect.expiresAt - c.hour).toFixed(1))}시간 남음`, `${Number((effect.expiresAt - c.hour).toFixed(1))} game hours left`, `残りゲーム${Number((effect.expiresAt - c.hour).toFixed(1))}時間`));
    const negative = harmful(effect.id) || (effect.check ?? 0) < 0 || (effect.periodicHp ?? 0) < 0 || Object.values(effect.stats ?? {}).some(value => value < 0) || !!effect.diceFaces || !!effect.dicePenalty;
    add(effect.id, name(effect.id, locale), parts.join(' · '), negative ? 'debuff' : 'buff');
  }
  if (c.buff && (c.buff.expiresAt === undefined || c.buff.expiresAt > c.hour)) {
    const skill = [...FANTASY_JOBS.flatMap(job => job.skills), ...FANTASY_RACES.flatMap(race => race.skills)].find(skill => skill.id === c.buff!.skill);
    const title = skill?.names?.[locale] ?? say('행동 준비', 'Prepared action', '行動の準備');
    const labels = { check: say('다음 적합한 판정', 'Next matching check', '次の適合する判定'), guard: say('방호', 'Guard', '防護'), travel: say('이동 시간 단축', 'Travel time reduction', '移動時間短縮'), reward: say('보수 보정', 'Reward bonus', '報酬補正'), heal: say('회복', 'Healing', '回復') };
    add('prepared', title, `${c.buff.stat ? statNames[c.buff.stat][locale] + ' · ' : ''}${labels[c.buff.effect]} +${c.buff.power}`, 'buff');
  }
  if (fighter) {
    for (const effect of fighter.effects) add(effect.id, name(effect.id, locale), effect.id === 'frost'
      ? say(`냉기로 행동과 명중에 불이익 · 강도 ${effect.power} · ${effect.turns}라운드 남음`, `Chill impairs actions and accuracy · strength ${effect.power} · ${effect.turns} rounds left`, `冷気で行動と命中に不利・強さ${effect.power}・残り${effect.turns}ラウンド`)
      : say(`라운드마다 HP -${effect.power} · ${effect.turns}라운드 남음`, `HP -${effect.power} per round · ${effect.turns} rounds left`, `毎ラウンドHP-${effect.power}・残り${effect.turns}ラウンド`), 'debuff');
    for (const effect of fighter.conditions ?? []) add(effect.id, name(effect.id, locale), `${fantasyCombatSkillBrief({ id: effect.id, names: words('', '', ''), kind: harmful(effect.id) ? 'hex' : 'boon', utility: effect.id, power: effect.power, mp: 0 }, locale)} · ${say('강도', 'Strength', '強さ')} ${effect.power} · ${effect.turns} ${say('라운드 남음', 'rounds left', 'ラウンド残り')}`, harmful(effect.id) ? 'debuff' : 'buff');
    if (fighter.ward > 0) add('combat-ward', say('방호막', 'Ward', '防護膜'), say(`피해 ${fighter.ward}까지 흡수하는 방호막.`, `A ward absorbing up to ${fighter.ward} damage.`, `被害を${fighter.ward}まで吸収する防護膜。`), 'buff');
    if (fighter.guarding) add('combat-guard', say('방어 자세', 'Guarding', '防御姿勢'), say('방어 자세로 받는 피해를 줄인다.', 'A defensive stance reduces incoming damage.', '防御姿勢で受ける被害を減らす。'), 'buff');
    if (fighter.aim) add('combat-aim', say('조준', 'Aiming', '照準'), `${say('명중', 'Accuracy', '命中')} +${fighter.aim.bonus} · ${fighter.aim.turns} ${say('라운드', 'rounds', 'ラウンド')}`, 'buff');
    if (fighter.blessing) add('combat-blessing', say('축복', 'Blessing', '祝福'), `${say('공격 강화', 'Attack blessing', '攻撃強化')} ${fighter.blessing.power} · ${fighter.blessing.turns} ${say('라운드', 'rounds', 'ラウンド')}`, 'buff');
  }
  return rows;
}
