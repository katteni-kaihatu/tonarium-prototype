import { fantasyJobHealingBonus } from './fantasy-job-balance.ts';
import { fantasyCombatFieldKind } from './fantasy-combat-fields.ts';
import { fantasyMiracleOrderError } from './fantasy-miracle-combat.ts';
import { FANTASY_MIRACLES, FANTASY_LAST_DAWN } from './fantasy-miracle-catalog.ts';
import { fantasyCombatAttackError, fantasyCombatHitChance, fantasyCombatOrderError, type FantasyCombatOptions, type FantasyCombatFighter, type FantasyCombatHitChance, type FantasyCombatSkill, type FantasyCombatState, type FantasyCombatError } from './fantasy-combat.ts';
import type { NpcLocale } from './npc.ts';
import { fantasyAttackGeometry, fantasyAttackShapeName } from './fantasy-attack-shapes.ts';
import { fantasyCombatDashLanding, fantasyCombatSkillMoveRange } from './fantasy-combat-movement.ts';

export type FantasyCombatAttackPreview = Partial<FantasyCombatHitChance> & { error?: FantasyCombatError };
export function fantasyCombatAttackPreview(state: FantasyCombatState, actor: FantasyCombatFighter, target: FantasyCombatFighter, skill?: FantasyCombatSkill): FantasyCombatAttackPreview {
  if(skill?.id===FANTASY_LAST_DAWN){const error=fantasyMiracleOrderError(state,actor,target,skill);return error?{error}:{chance:1};}
  const error = fantasyCombatAttackError(state, actor, target, skill);
  if (error) return { error };
  const landing = skill?.motion?.kind === 'advance' ? fantasyCombatDashLanding(state, actor, target, skill) : undefined;
  return fantasyCombatHitChance(state, landing ? { ...actor, tile: landing } : actor, target, skill);
}
export function fantasyCombatItemAttackPreview(state:FantasyCombatState,user:string,item:string,target:FantasyCombatFighter,options:FantasyCombatOptions):FantasyCombatAttackPreview{
  const error=fantasyCombatOrderError(state,user,{type:'item',item,target:target.id},options);
  if(error)return{error};
  const actor=state.fighters.find(fighter=>fighter.userId===user),art=options.supplies?.[user]?.[item]?.combat;
  return actor&&art?.kind==='attack'?fantasyCombatHitChance(state,actor,target,art):{error:'item'};
}
export function fantasyCombatCanTargetSelf(skill: FantasyCombatSkill): boolean { return ['heal', 'mana', 'guard', 'focus', 'cleanse', 'blessing', 'boon'].includes(skill.kind); }
export function fantasyCombatSkillBrief(skill: FantasyCombatSkill, locale: NpcLocale): string {
  const text = (ko: string, en: string, ja: string) => ({ ko, en, ja })[locale];
  if (skill.id === FANTASY_LAST_DAWN) return text('전장 전체를 구하는 희생의 기적. 승리하면 시전자는 영구 사망합니다.', 'A battlefield-wide sacrifice. The caster permanently dies on victory.', '戦場全体を救う犠牲の奇跡。勝利すると術者は永久に死亡します。');
  const miracle = FANTASY_MIRACLES.find(entry => entry.id === skill.id);
  if (miracle) return miracle.descriptions[locale].split(/(?<=。)|(?<=[.!?])(?:\s+|$)|\n/u)[0];
  if (skill.motion?.kind === 'reposition') return text('빈칸으로 크게 이동해 유리한 위치를 잡습니다.', 'Move to an empty tile to gain a better position.', '空きマスへ大きく移動し、有利な位置を取ります。');
  if (skill.motion?.kind === 'dash') return text('적을 관통하며 공격하고 뒤쪽 빈칸으로 이동합니다.', 'Strike through enemies and land in a free tile behind them.', '敵を貫いて攻撃し、背後の空きマスへ移動します。');
  if (skill.motion?.kind === 'advance') return text('대상 앞으로 접근한 뒤 공격합니다.', 'Close in and strike from in front of the target.', '対象の手前へ近づいてから攻撃します。');
  const utility: Record<string, string> = {
    haste: text('아군의 이동과 회피를 돕습니다.', 'Improve an ally’s movement and evasion.', '味方の移動と回避を助けます。'),
    regen: text('아군의 HP를 매 라운드 회복합니다.', 'Restore an ally’s HP each round.', '味方のHPを毎ラウンド回復します。'),
    clarity: text('아군의 마법 명중과 저항을 높입니다.', 'Improve an ally’s magical accuracy and resistance.', '味方の魔法命中と魔法抵抗を高めます。'),
    thorns: text('받은 타격 피해의 일부를 반사합니다.', 'Reflect part of the damage actually received.', '受けた打撃の一部を反射します。'),
    lifesteal: text('가한 피해의 일부를 HP로 흡수합니다.', 'Drain part of dealt damage as HP.', '与えた被害の一部をHPとして吸収します。'),
    resolve: text('받는 피해를 줄이고 상태이상을 한 번 막습니다.', 'Reduce damage and block one ailment.', '被害を減らし、状態異常を一度防ぎます。'),
    weaken: text('적이 주는 피해를 줄입니다.', 'Reduce the enemy’s outgoing damage.', '敵が与える被害を減らします。'),
    vulnerable: text('적이 받는 피해를 늘립니다.', 'Increase damage taken by the enemy.', '敵が受ける被害を増やします。'),
    blind: text('적의 명중률을 낮춥니다.', 'Reduce the enemy’s accuracy.', '敵の命中率を下げます。'),
    bleed: text('적에게 매 라운드 출혈 피해를 줍니다.', 'Inflict bleeding damage each round.', '毎ラウンド出血による被害を与えます。'),
    root: text('적의 위치 이동을 막습니다.', 'Prevent the enemy from moving between tiles.', '敵の位置移動を封じます。'),
    silence: text('적이 MP를 쓰는 기술을 사용하지 못하게 합니다.', 'Prevent skills that require MP.', 'MPを使う技能を封じます。'),
  };
  if (skill.utility && utility[skill.utility]) return utility[skill.utility];
  if (skill.kind === 'attack') {
    const geometry = fantasyAttackGeometry(skill), shape = fantasyAttackShapeName(geometry, locale);
    const attack = text(`${shape}으로 ${skill.magic ? '마법' : '물리'} 피해를 줍니다.`, `Deal ${skill.magic ? 'magical' : 'physical'} damage in a ${shape.toLowerCase()} pattern.`, `${shape}の形に${skill.magic ? '魔法' : '物理'}被害を与えます。`);
    return fantasyCombatFieldKind(skill) ? attack + ' ' + text('남은 특수 바닥은 아군과 적 모두에게 영향을 줍니다.', 'The lingering ground affects allies and enemies alike.', '残る特殊な床は敵味方の両方に作用します。') : attack;
  }
  return ({
    heal: text('자신이나 아군의 HP를 회복합니다.', 'Restore your own or an ally’s HP.', '自分か味方のHPを回復します。'),
    mana: text('자신이나 아군의 MP를 회복합니다.', 'Restore your own or an ally’s MP.', '自分か味方のMPを回復します。'),
    guard: text('자신이나 아군이 받는 피해를 줄입니다.', 'Protect yourself or an ally from damage.', '自分か味方が受ける被害を軽減します。'),
    focus: text('다음 공격의 명중을 돕습니다.', 'Improve accuracy for the next attack.', '次の攻撃の命中を助けます。'),
    cleanse: text('해로운 상태를 정화합니다.', 'Remove harmful conditions.', '悪い状態を浄化します。'),
    blessing: text('자신이나 아군에게 축복을 겁니다.', 'Bestow a blessing on yourself or an ally.', '自分か味方に祝福を与えます。'),
    miracle: text('피해로 쓰러진 아군을 일으킵니다.', 'Raise an ally downed by wounds.', '負傷で倒れた味方を起こします。'),
    boon: text('자신이나 아군을 강화합니다.', 'Strengthen yourself or an ally.', '自分か味方を強化します。'),
    hex: text('적에게 약화 효과를 남깁니다.', 'Inflict a weakening effect on the enemy.', '敵に弱体効果を与えます。'),
  } as Record<string, string>)[skill.kind];
}
export function fantasyCombatSkillSummary(skill: FantasyCombatSkill, locale: NpcLocale, actor?: FantasyCombatFighter): string {
  const text = (ko: string, en: string, ja: string) => ({ ko, en, ja })[locale];
  const miracle = FANTASY_MIRACLES.find(entry=>entry.id===skill.id); if(miracle)return `${miracle.descriptions[locale]} · MP ${skill.mp}`;
  if(skill.id===FANTASY_LAST_DAWN)return text('전장 전체의 적에게 마법 방어를 무시하는 성속성 피해. 전장 전체의 피해 빈사 아군을 일으키고 아군 HP 55% 회복. 자신은 즉시 실신하며 이 전투 승리 시 반드시 사망.','Holy damage hits every enemy on the battlefield, ignoring magical defenses. Raise wounded allies across the field and restore 55% HP. The caster collapses immediately and must die if this battle is won.','戦場全体の敵へ魔法防御無視の聖属性ダメージ。戦場全体の負傷で倒れた味方を起こし、味方のHP55%回復。術者は即座に失神し、この戦闘に勝利すると必ず死亡。');
  if (skill.motion?.kind === 'reposition') {
    const distance = actor ? fantasyCombatSkillMoveRange(actor, skill) : skill.motion.distance;
    return text(`전술 재배치 · 최대 ${distance}칸 · MP ${skill.mp} · 빈칸 선택`, `Tactical reposition · up to ${distance} tiles · MP ${skill.mp} · choose an empty tile`, `戦術移動・最大${distance}マス・MP${skill.mp}・空きマスを選択`);
  }
  const range = skill.range ?? (skill.kind !== 'attack' || skill.magic ? 'magic' : actor?.range), reach = skill.reach ?? (range ? range === 'melee' ? 1 : range === 'ranged' ? 7 : 8 : undefined);
  const magic = skill.reach !== undefined ? skill.magic === true : skill.magic === true || range === 'magic';
  const kinds = { attack: text(magic ? '마법 공격' : '물리 공격', magic ? 'Magic attack' : 'Physical attack', magic ? '魔法攻撃' : '物理攻撃'),
    heal: text('회복', 'Healing', '回復'), mana: text('마나 회복 · 전투당 한 번', 'Mana recovery · once per battle', 'マナ回復・一戦に一度'), guard: text('방호', 'Ward', '防護'), focus: text('조준 지원', 'Aim support', '照準支援'), cleanse: text('정화', 'Cleanse', '浄化'), blessing: text('축복', 'Blessing', '祝福'), miracle: text('기적 · 쓰러진 동료를 일으킴', 'Miracle · raises a fallen ally', '奇跡・倒れた仲間を起こす'), boon: text('아군 강화', 'Ally boon', '味方の強化'), hex: text('적 약화', 'Enemy hex', '敵への弱体') };
  const geometry = fantasyAttackGeometry(skill);
  const area = skill.kind === 'attack' && geometry !== 'burst' ? fantasyAttackShapeName(geometry, locale) : text(`반경 ${skill.radius ?? 0}`, `Radius ${skill.radius ?? 0}`, `半径${skill.radius ?? 0}`);
  const parts = [kinds[skill.kind], `MP ${skill.mp}`, text(`기본 위력 ${skill.power}`, `Base power ${skill.power}`, `基本威力${skill.power}`), reach === undefined ? text('무기의 사거리', 'Weapon reach', '武器の射程') : text(`사거리 ${reach}`, `Reach ${reach}`, `射程${reach}`), area];
  if (skill.motion?.kind === 'dash') parts[0] = text('관통 돌진 공격', 'Piercing dash attack', '貫通突進攻撃');
  if (skill.motion?.kind === 'advance') parts[0] = text('접근 후 공격', 'Approach then attack', '接近後に攻撃');
  if (skill.kind === 'attack') {
    if (geometry === 'burst') parts.push(fantasyAttackShapeName(geometry, locale));
    if (skill.secondaryDamage) parts.push(text(`주변 대상 피해 ${skill.secondaryDamage}%`, `Secondary damage ${skill.secondaryDamage}%`, `副対象への被害${skill.secondaryDamage}%`));
  }
  if (skill.motion?.kind === 'dash') parts.push(text(`관통 돌진 · 최대 ${skill.motion.distance}칸 · 대상 뒤 빈칸 필요`, `Piercing dash · up to ${skill.motion.distance} tiles · needs a free tile behind target`, `貫通突進・最大${skill.motion.distance}マス・対象の背後に空きマスが必要`));
  if (skill.motion?.kind === 'advance') parts.push(text(`접근 공격 · 최대 ${skill.motion.distance}칸 · 대상 앞에 착지`, `Approach attack · up to ${skill.motion.distance} tiles · land before target`, `接近攻撃・最大${skill.motion.distance}マス・対象の手前へ着地`));
  if (skill.hitUtility) {
    const labels = { weaken: text('약화', 'Weaken', '弱化'), vulnerable: text('틈새 노출', 'Vulnerable', '隙の露出'), blind: text('시야 교란', 'Blind', '視界妨害'), bleed: text('출혈', 'Bleed', '出血'), root: text('속박', 'Root', '束縛'), silence: text('침묵', 'Silence', '沈黙') };
    const strength = skill.hitUtility.id === 'vulnerable' ? text(`받는 피해 +${Math.round(Math.min(.35,skill.hitUtility.power*.025)*100)}%`, `damage taken +${Math.round(Math.min(.35,skill.hitUtility.power*.025)*100)}%`, `受ける被害+${Math.round(Math.min(.35,skill.hitUtility.power*.025)*100)}%`) : String(skill.hitUtility.power);
    parts.push(`${labels[skill.hitUtility.id]} ${strength} · ${Math.round(skill.hitUtility.chance * 100)}% · ${text('유효 명중 시 3라운드', 'on a damaging hit for 3 rounds', '有効命中時3ラウンド')}`);
  }
  if (actor && skill.kind === 'mana') { const restored = skill.power + Math.floor(actor.stats.intelligence * .4); parts.push(text(`MP 최대 ${restored} 회복`, `Restore up to ${restored} MP`, `MPを最大${restored}回復`)); }
  if (actor && skill.kind === 'heal') { const restored = skill.power + Math.floor(actor.stats.intelligence * .8) + fantasyJobHealingBonus(actor.vocation?.job,actor.stats.hp); parts.push(text(`HP 최대 ${restored} 회복`, `Restore up to ${restored} HP`, `HPを最大${restored}回復`)); }
  const ground=fantasyCombatFieldKind(skill);
  if(ground){
    const labels={fire:text('불길','Flames','炎'),frost:text('서리','Frost','霜'),poison:text('독액','Poison','毒'),storm:text('전류','Static','電流')};
    parts.push(text(`${labels[ground]} 바닥 · 반경 ${Math.min(2,skill.radius??0)} · 3라운드 · 아군도 영향`,`${labels[ground]} ground · radius ${Math.min(2,skill.radius??0)} · 3 rounds · affects allies too`,`${labels[ground]}の床・半径${Math.min(2,skill.radius??0)}・3ラウンド・味方にも作用`));
  }
  if (skill.selfOnly) parts.push(text('자신 전용', 'Self only', '自分専用'));
  else if (fantasyCombatCanTargetSelf(skill)) parts.push(text('자신 또는 동료', 'Self or ally', '自分か仲間'));
  if (skill.hitBonus) parts.push(text(`명중 ${skill.hitBonus > 0 ? '+' : ''}${skill.hitBonus}`, `Accuracy ${skill.hitBonus > 0 ? '+' : ''}${skill.hitBonus}`, `命中${skill.hitBonus > 0 ? '+' : ''}${skill.hitBonus}`));
  if (skill.effects?.burn) parts.push(text(`화상 ${skill.effects.burn} · 3라운드`, `Burn ${skill.effects.burn} · 3 rounds`, `火傷${skill.effects.burn}・3ラウンド`));
  if (skill.effects?.slow) parts.push(text(`둔화 ${skill.effects.slow} · 3라운드`, `Slow ${skill.effects.slow} · 3 rounds`, `鈍化${skill.effects.slow}・3ラウンド`));
  if (skill.effects?.cleanse) parts.push(text('해로운 상태 정화', 'Cleanses ailments', '悪い状態を浄化'));
  if (skill.effects?.guard) parts.push(text(`방호 ${skill.effects.guard}`, `Ward ${skill.effects.guard}`, `防護${skill.effects.guard}`));
  if (skill.effects?.might) parts.push(text(`공격 강화 ${skill.effects.might} · 3라운드`, `Attack +${skill.effects.might} · 3 rounds`, `攻撃強化${skill.effects.might}・3ラウンド`));
  if (skill.utility) {
    const power = Math.max(1, Math.min(12, skill.power));
    const details: Record<string, string> = {
      haste: text(`이동 +1 · 회피 +${power}`, `Move +1 · evasion +${power}`, `移動+1・回避+${power}`),
      regen: text(`매 라운드 HP +${power}`, `HP +${power} each round`, `毎ラウンドHP+${power}`),
      clarity: text(`마법 명중 +${power} · 마법 저항 +${power * 2}`, `Magic accuracy +${power} · magic resistance +${power * 2}`, `魔法命中+${power}・魔法抵抗+${power * 2}`),
      thorns: text(`받은 타격 피해 중 최대 ${power} 반사`, `Reflect up to ${power} of actual hit damage`, `受けた打撃から最大${power}を反射`),
      lifesteal: text(`실제 피해의 ${Math.min(30, power * 2)}%를 HP로 흡수`, `Drain ${Math.min(30, power * 2)}% of actual damage as HP`, `実際の被害の${Math.min(30, power * 2)}%をHPとして吸収`),
      resolve: text(`받는 피해 −${power * 2}% · 상태이상 1회 방어`, `Incoming damage −${power * 2}% · block one ailment`, `受ける被害−${power * 2}%・状態異常を1回防ぐ`),
      weaken: text(`주는 피해 −${power * 2}%`, `Outgoing damage −${power * 2}%`, `与える被害−${power * 2}%`),
      vulnerable: text(`받는 피해 +${power * 2.5}%`, `Incoming damage +${power * 2.5}%`, `受ける被害+${power * 2.5}%`),
      blind: text(`명중 −${power * 2}`, `Accuracy −${power * 2}`, `命中−${power * 2}`),
      bleed: text(`매 라운드 HP −${power}`, `HP −${power} each round`, `毎ラウンドHP−${power}`),
      root: text('위치 이동 불가', 'Cannot move between tiles', '位置の移動不可'),
      silence: text('MP를 쓰는 술기 사용 불가', 'Cannot use arts that cost MP', 'MPを使う術は使用不可'),
    };
    const detail = details[skill.utility];
    if (detail) parts.push(`${detail} · ${text('3라운드', '3 rounds', '3ラウンド')}`);
  }
  if (skill.onHit) { const status = { burn: text('화상', 'Burn', '火傷'), frost: text('둔화', 'Slow', '鈍化'), poison: text('중독', 'Poison', '毒') }[skill.onHit.id]; parts.push(`${status} ${skill.onHit.power} · ${Math.round(skill.onHit.chance * 100)}% · ${text('3라운드', '3 rounds', '3ラウンド')}`); }
  return parts.join(' · ');
}
