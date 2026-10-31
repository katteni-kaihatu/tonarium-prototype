import { fantasyEquipGear } from '../../../shared/fantasy-equipment.ts';
import { fantasyOffhandEquipError } from '../../../shared/fantasy-equipment-slots.ts';
import {fantasyCombatSkillSummary} from '../../../shared/fantasy-combat-preview.ts';
import { fantasyHasJob } from '../../../shared/fantasy-careers.ts';
import { fantasyRankBookReadError } from '../../../shared/fantasy-rank-rewards.ts';
import {fantasyWorldUtilityError} from '../../../shared/fantasy-world-utilities.ts';
import {FANTASY_SKILL_UTILITIES} from '../../../shared/fantasy-skill-variety.ts';
import { fantasyFacilityActionError } from '../../../shared/fantasy-facility-hours.ts';
import type { FantasyAction, FantasyCharacter, FantasyItem, FantasySkill } from '../../../shared/fantasy.ts';
import type { NpcLocale } from '../../../shared/npc.ts';
import { FANTASY_ITEMS } from '../../../shared/fantasy-data.ts';
import { fantasySkills, fantasyStats, fantasyTransports } from '../../../shared/fantasy-engine.ts';
import { canAcquireJob, canSellItem, fantasyBuildings, FANTASY_MAPS } from '../../../shared/fantasy-town.ts';
import { FANTASY_DINING, FANTASY_LODGINGS, foodMeta } from '../../../shared/fantasy-life.ts';
import { fantasyPrice } from '../../../shared/fantasy-reputation.ts';
import { fantasyManaSkillError } from '../../../shared/fantasy-mana.ts';
import { applyFantasyItemUse } from '../../../shared/fantasy-effects.ts';
import { fantasySaleDisabledReason, fantasySaleGroups } from '../../../shared/fantasy-sales.ts';
import { FANTASY_DICE_FACES } from '../../../shared/fantasy-dice.ts';
import { FANTASY_TERMS } from '../../../shared/fantasy-lore.ts';
import { statLabels } from './fantasy-copy.ts';
import { fantasyMainInvestigationError } from '../../../shared/fantasy-main-trials.ts';
import { fantasyEnvironmentActionError } from '../../../shared/fantasy-environment.ts';
import { fantasyErrorText } from './fantasy-copy.ts';

const say=(locale:NpcLocale,ko:string,en:string,ja:string)=>({ko,en,ja})[locale];
export function actionHelp(c:FantasyCharacter|undefined,action:FantasyAction,locale:NpcLocale):string|undefined {
  if(!c)return undefined;
  const facilityError=fantasyFacilityActionError(c,action);if(facilityError)return fantasyErrorText(facilityError,locale);
  if(action.type==='investigate'){
    const error=fantasyMainInvestigationError(c,action)??fantasyEnvironmentActionError(c,action);
    return error?fantasyErrorText(error,locale):undefined;
  }
  const missing=say(locale,'소지하고 있지 않습니다.','You do not have this item.','その品物を持っていません。');
  if(action.type==='skill'){
    const skill=fantasySkills(c).find(skill=>skill.id===action.skill&&skill.kind==='active');
    if(!skill)return say(locale,'아직 배우지 않은 기술입니다.','You have not learned this skill.','まだ習得していない技能です。');
    if(c.mp<skill.mp)return say(locale,'MP가 부족합니다.','Not enough MP.','MPが足りません。');
    if(fantasyManaSkillError(c,skill.id))return say(locale,'마나 부하가 높습니다. 먼저 쉬어야 합니다.','Mana strain is too high. Rest first.','マナの負荷が高すぎます。先に休んでください。');
    if(skill.restore==='mp'&&(c.mp>=fantasyStats(c).mp||c.manaRecoveryAt!==undefined&&c.hour-c.manaRecoveryAt<6))return say(locale,'MP가 가득 찼거나 회복 기술이 아직 준비되지 않았습니다.','MP is full or recovery is not ready yet.','MPが満タンか、回復の準備中です。');
    if(skill.effect==='heal'&&skill.restore!=='mp'&&c.hp>=fantasyStats(c).hp)return say(locale,'HP가 이미 가득 찼습니다.','HP is already full.','HPはすでに満タンです。');
    const utilityError=fantasyWorldUtilityError(c,skill);if(utilityError)return fantasyErrorText(utilityError,locale);
    if(!skill.utility&&skill.effect!=='heal'&&c.buff)return say(locale,'현재 강화 효과를 먼저 사용해야 합니다.','Use the current temporary effect first.','先に現在の強化効果を使ってください。');
  }
  if(action.type==='job'&&fantasyHasJob(c,action.job))return say(locale,'이미 가지고 있는 직업입니다.','You already have this profession.','すでに就いている職業です。');
  if(action.type==='job'&&!canAcquireJob(c,action.job,action.via??'guild',action.npcId))return say(locale,'이곳이나 이 스승에게는 배울 수 없는 직업입니다.','This place or mentor cannot teach that profession.','この場所や師匠からは学べない職業です。');
  if(action.type==='sell'){
    if(c.bag===action.item&&(c.inventory[action.item]??0)<=1)return say(locale,'사용 중인 가방입니다. 다른 가방으로 바꾼 뒤 판매하세요.','Change to another bag before selling the one in use.','使用中の鞄です。別の鞄に替えてから売ってください。');
    if(!canSellItem(c,action.item))return say(locale,'이곳에는 이 물건을 사 주는 상인이 없습니다.','No local merchant buys this item.','ここにはこの品物を買い取る商人がいません。');
    if((c.inventory[action.item]??0)<=0)return missing;
    const groups=fantasySaleGroups(c,action.item),selected=action.instance?groups.find(group=>group.instance===action.instance):action.quality?groups.find(group=>group.quality===action.quality):groups.length===1?groups[0]:undefined;
    if((action.instance||action.quality)&&!selected)return say(locale,'선택한 묶음이나 장비를 소지하고 있지 않습니다.','You no longer own that batch or equipment.','選んだ品や装備を持っていません。');
    if(selected&&!selected.canSell)return fantasySaleDisabledReason(selected,locale);
    if(!action.quality&&groups.filter(group=>group.quality).length>1)return say(locale,'판매할 음식 묶음을 먼저 선택하세요.','Choose the food batch to sell first.','売る食品のまとまりを先に選んでください。');
    if((c.inventory[action.item]??0)<=1&&(Object.values(c.equipment??{}).includes(action.item)||c.outfit===action.item))return say(locale,'착용 중인 마지막 물건은 팔 수 없습니다.','Unequip the last copy before selling it.','着用中の最後の1個は売れません。');
  }
  if(action.type==='use'){
    if((c.inventory[action.item]??0)<=0)return missing;
    if(FANTASY_ITEMS.find(item=>item.id===action.item)?.category==='rank-skill-book')return fantasyRankBookReadError(c,action.item,locale);
    const map=FANTASY_MAPS.find(map=>map.item===action.item);
    if(map&&map.locationIds.every(id=>c.charted.includes(id)||c.visited.includes(id)))return say(locale,'이 지도에 나온 지역은 모두 기록했습니다.','All regions on this map are already charted.','この地図の地域はすべて記録済みです。');
    const item=FANTASY_ITEMS.find(item=>item.id===action.item),maximum=fantasyStats(c);
    if(item?.use&&!applyFantasyItemUse(structuredClone(c),item,maximum).changed)return say(locale,'이 아이템으로 회복하거나 강화할 효과가 없습니다.','This item has no restorative or strengthening effect to apply now.','この品物で回復や強化できる効果がありません。');
    if(!map&&!['study-volume','rune-record','black-market-study','black-market-relic'].includes(item?.category??'')&&!item?.use&&c.hp>=maximum.hp&&c.mp>=maximum.mp&&(!foodMeta(action.item)||c.hunger<=0))return say(locale,'회복할 HP·MP나 허기가 없습니다.','No HP, MP or hunger needs recovery.','回復するHP・MPや空腹がありません。');
  }
  if(action.type==='read'&&c.readBooks?.includes(action.book))return say(locale,'이미 정독한 책입니다.','You have already studied this book.','すでに精読した本です。');
  if(action.type==='equip'){
    if((c.inventory[action.item]??0)<=0)return missing;
    const equipment=FANTASY_ITEMS.find(item=>item.id===action.item)?.equipment;
    if(!equipment)return say(locale,'장착할 수 없는 물건입니다.','This item cannot be equipped.','装備できない品物です。');
    const definition=FANTASY_ITEMS.find(item=>item.id===action.item)!;
    const restriction=fantasyOffhandEquipError(c,definition,locale);if(restriction)return restriction;
    const error=fantasyEquipGear(structuredClone(c),action.item,action.instance,action.slot);
    if(error==='すでに装備しています。')return say(locale,'이미 장착 중입니다.','Already equipped.','すでに装備中です。');
    if(error)return say(locale,'해당 부위에 사용할 수 있는 미착용 장비를 선택하세요.','Choose an available owned copy for this slot.','この部位で使える未装備の品を選んでください。');
  }
  if(action.type==='unequip'&&!c.equipment?.[action.slot])return say(locale,'이 부위에는 장착한 장비가 없습니다.','Nothing is equipped in this slot.','この部位には装備がありません。');
  if(action.type==='wear'&&c.outfit===action.item)return say(locale,'이미 입고 있는 옷입니다.','You are already wearing this outfit.','すでに着ている服です。');
  if(action.type==='lodge'){
    if(!fantasyBuildings(c).some(building=>building.id==='inn'))return say(locale,'현재 지역에 여관이 없습니다.','There is no inn here.','現在地には宿屋がありません。');
    const room=FANTASY_LODGINGS.find(room=>room.id===action.room);
    if(room&&c.gold<fantasyPrice(c,room.cost,'room'))return say(locale,'숙박비가 부족합니다.','Not enough gold for this room.','宿泊代が足りません。');
  }
  if(action.type==='eat'){
    const meal=FANTASY_DINING.find(meal=>meal.id===action.meal);
    if(meal&&c.gold<fantasyPrice(c,meal.cost,'food'))return say(locale,'식사비가 부족합니다.','Not enough gold for this meal.','食事代が足りません。');
  }
  if(action.type==='buy'){
    const base=FANTASY_ITEMS.find(item=>item.id===action.item)?.price??FANTASY_MAPS.find(map=>map.item===action.item)?.price??0;
    if(c.gold<fantasyPrice(c,base,'goods'))return say(locale,'소지금이 부족합니다.','Not enough gold.','所持金が足りません。');
  }
  if(action.type==='travel'){
    const route=fantasyTransports(c,action.destination).find(route=>route.id===action.transport);
    if(route&&!route.available)return c.gold<route.cost?say(locale,'이동 비용이 부족합니다.','Not enough gold for this journey.','移動費用が足りません。'):say(locale,'이 이동수단을 사용할 조건이 맞지 않습니다.','This travel option is unavailable.','この移動手段の条件が整っていません。');
  }
  return undefined;
}

export function skillEffectText(skill:FantasySkill,locale:NpcLocale,character?:FantasyCharacter):string {
  const stat=skill.stat?statLabels[locale][skill.stat]:say(locale,'판정','checks','判定');
  const value=character?fantasySkills(character).find(known=>known.id===skill.id)?.power??skill.power:skill.power;
  const check=skill.stat?say(locale,`${stat} 판정`,`${stat} checks`,`${stat}判定`):stat;
  const effect=skill.restore==='mp'?`MP +${value}`:skill.effect==='heal'?`HP +${value}`:skill.effect==='guard'?say(locale,`받는 피해 -${value}`,`Incoming damage -${value}`,`受ける被害 -${value}`):skill.effect==='reward'?say(locale,`성과 +${value}`,`Yield +${value}`,`成果 +${value}`):skill.effect==='travel'?say(locale,`이동 시간 -${value}시간`,`Travel time -${value} h`,`移動時間 -${value}時間`):`${check} +${value}`;
  const utility=FANTASY_SKILL_UTILITIES.find(entry=>entry.id===skill.utility);
  if(utility)return utility.descriptions[locale]+(skill.mp?` · MP -${skill.mp}`:'');
  return `${effect}${skill.mp?` · MP -${skill.mp}`:''}${skill.diceFaces?` · D6: ${FANTASY_DICE_FACES[skill.diceFaces].join('·')}`:''}`;
}

export function skillBriefText(skill:FantasySkill,locale:NpcLocale):string {
  const description=skillDescriptionText(skill,locale);
  const sentence=description.split(/(?<=。)|(?<=[.!?])(?:\s+|$)|\n/u)[0];
  return sentence.length>140?sentence.slice(0,137)+'…':sentence;
}

export function skillDescriptionText(skill:FantasySkill,locale:NpcLocale):string {
  if(skill.descriptions?.[locale])return skill.descriptions[locale];
  const active=skill.kind==='active';
  if(skill.restore==='mp')return say(locale,'MP를 회복합니다. 전투에서는 자신 또는 아군에게 사용할 수 있습니다.','Restores MP; self or an ally in combat.','MPを回復。戦闘中は自分か味方を対象にできます。');
  if(skill.effect==='heal')return say(locale,'자신의 HP를 회복합니다.','Restores your own HP.','自分のHPを回復します。');
  if(skill.effect==='guard')return active?say(locale,'다음에 받는 피해를 줄이도록 준비합니다.','Prepares protection against the next damage you take.','次に受ける被害を軽減する備えです。'):say(locale,'피해를 받을 때 피해량을 줄입니다.','Reduces incoming damage.','受ける被害を軽減します。');
  if(skill.effect==='reward')return active?say(locale,'다음 일이나 채집 등의 성과를 늘립니다.','Increases the yield of your next work or gathering action.','次の仕事や採集などの成果を増やします。'):say(locale,'일·탐색·제작 등의 성과를 늘립니다.','Increases yields from work, exploration and crafting.','仕事・探索・制作などの成果を増やします。');
  if(skill.effect==='travel')return active?say(locale,'다음 이동에 드는 시간을 줄입니다.','Reduces the time needed for your next journey.','次の移動にかかる時間を短くします。'):say(locale,'이동에 드는 시간을 줄입니다.','Reduces journey times.','移動にかかる時間を短くします。');
  return active?say(locale,'다음 해당 능력 판정을 강화합니다. 준비는 6시간 동안 유지됩니다.','Strengthens the next matching ability check. Preparation lasts 6 world hours.','次の対応能力の判定を強化します。備えは世界時間で6時間続きます。'):say(locale,'해당 능력을 사용하는 판정을 돕습니다.','Helps checks that use the matching ability.','対応する能力を使う判定を助けます。');
}

export function itemDisplayName(id:string,locale:NpcLocale):string {
  const item=FANTASY_ITEMS.find(item=>item.id===id);
  return item?.names?.[locale]??FANTASY_TERMS.find(term=>term.id===id)?.names[locale]??FANTASY_MAPS.find(map=>map.item===id)?.name[locale]??item?.name??id;
}

export function itemUseEffectText(item:FantasyItem,locale:NpcLocale):string[] {
  const use=item.use,food=foodMeta(item.id);
  if(item.combatUse)return [fantasyCombatSkillSummary({id:item.id,names:item.names??{ko:item.name,en:item.name,ja:item.name},...item.combatUse,mp:0},locale)];
  const parts:string[]=[];
  const legacy=item.id==='meal'?{hp:25,mp:8}:item.id==='potion'?{hp:35,mp:20}:item.id==='antidote'?{hp:10,mp:12}:item.id==='jerky'?{hp:12}:item.id==='bread'?{hp:6}:{};
  const hp=use?.hp??legacy.hp,mp=use?.mp??legacy.mp,hunger=use?.hunger??food?.nutrition;
  if(hp)parts.push(`HP +${hp}`);if(mp)parts.push(`MP +${mp}`);
  if(use?.fatigue)parts.push(say(locale,`피로 -${use.fatigue}`,`Fatigue -${use.fatigue}`,`疲労 -${use.fatigue}`));
  if(hunger)parts.push(say(locale,`허기 -${hunger}`,`Hunger -${hunger}`,`空腹 -${hunger}`));
  if(use?.cure?.length){const names:Record<string,[string,string,string]>={poison:['중독','poison','毒'],burn:['화상','burn','火傷'],frost:['냉기','chill','冷気'],weakness:['쇠약','weakness','衰弱']};const ailments=use.cure.map(id=>names[id]?.[locale==='ko'?0:locale==='en'?1:2]??id).join(' · ');parts.push(say(locale,`${ailments} 치료`,`Cures ${ailments}`,`${ailments}を治療`));}
  if(use?.effect){const e=use.effect;parts.push(say(locale,`일시 효과 ${e.hours}시간`,`Temporary effect for ${e.hours} hours`,`一時効果 ${e.hours}時間`));for(const [stat,value]of Object.entries(e.stats??{}))parts.push(`${statLabels[locale][stat as keyof typeof statLabels.ko]} +${value}`);if(e.check)parts.push(say(locale,`판정 +${e.check}`,`Checks +${e.check}`,`判定 +${e.check}`));if(e.guard)parts.push(say(locale,`피해 -${e.guard}`,`Damage -${e.guard}`,`被害 -${e.guard}`));}
  for(const [stat,value]of Object.entries(use?.permanent??{}))parts.push(say(locale,`${statLabels[locale][stat as keyof typeof statLabels.ko]} 영구 +${value}`,`Permanent ${statLabels[locale][stat as keyof typeof statLabels.ko]} +${value}`,`${statLabels[locale][stat as keyof typeof statLabels.ko]} 永久 +${value}`));
  if(item.foodPenalty){
    const penalty=item.foodPenalty;
    if(penalty.fatigue)parts.push(say(locale,`피로 +${penalty.fatigue}`,`Fatigue +${penalty.fatigue}`,`疲労 +${penalty.fatigue}`));
    if(penalty.status)parts.push(penalty.status==='poison'?say(locale,'중독 · 지속 피해와 판정 불이익','Poison · ongoing damage and check penalties','毒・継続ダメージと判定の不利'):say(locale,'쇠약 · 판정 불이익','Weakness · check penalties','衰弱・判定の不利'));
  }
  if(food)parts.push(item.foodPenalty?say(locale,'시간이 지나도 해로운 성질은 사라지지 않습니다.','Ageing does not remove harmful properties.','時間が経っても有害な性質は消えません。'):say(locale,'신선할 때의 기본 효과이며 상태에 따라 줄어들 수 있습니다.','Base effects when fresh; deterioration can reduce them.','新鮮なときの基本効果です。状態により弱まります。'));
  return parts;
}
