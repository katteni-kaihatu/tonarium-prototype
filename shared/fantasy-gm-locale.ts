import type { FantasyProfile, FantasySkill, FantasyStat } from './fantasy.ts';
import { fantasyHasJob, fantasyLifeJob } from './fantasy-careers.ts';
import { FANTASY_WORLD_TIME_RATE } from './fantasy.ts';
import type { FantasyGmReply, FantasyGmSourceReply } from './fantasy-gm.ts';
import { FANTASY_EVENTS, FANTASY_JOBS, FANTASY_LOCATIONS, FANTASY_QUESTS, FANTASY_RECIPES } from './fantasy-data.ts';
import { fantasySkills, fantasyStats, fantasyTransports } from './fantasy-engine.ts';
import { FANTASY_DINING, FANTASY_LODGINGS } from './fantasy-life.ts';
import { FANTASY_MAPS, canAcquireJob, fantasyBuildings, fantasyCanCraft, fantasyCraftFacility, fantasyFrontierLocations, fantasyKnownLocations } from './fantasy-town.ts';
import { FANTASY_TERMS, fantasyTermName } from './fantasy-lore.ts';
import { fantasyEventText, fantasyQuestText } from './fantasy-narrative.ts';
import { fantasySkillName } from './fantasy-skill-names.ts';
import { fantasyNpcMentorSkills } from './fantasy-apprenticeship.ts';
import { fantasyEventEligible, fantasyQuestEligible, fantasyQuestRecordEligible } from './fantasy-access.ts';
import { FANTASY_CONTEXT_NAMES, fantasyContextBonus } from './fantasy-physiology.ts';
import { FANTASY_MANA_EXERCISES, FANTASY_MANA_PRINCIPLES, fantasyMana } from './fantasy-mana.ts';
import { FANTASY_ALCHEMY_FORMULAS, FANTASY_COMPANIONS, FANTASY_MAGIC_COMBINATIONS, FANTASY_MAGIC_ELEMENTS, FANTASY_MAGIC_FORMS, fantasySpecializationSummary } from './fantasy-specializations.ts';
import { fantasyPersonalQuest } from './fantasy-contracts.ts';
import { FANTASY_GATHERING_NAMES } from './fantasy-gathering.ts';
import { FANTASY_MONSTERS } from './fantasy-monsters.ts';
import { FANTASY_TERRAIN_ACTIVITIES } from './fantasy-terrain.ts';
import { FANTASY_LIBRARY_BOOKS } from './fantasy-library.ts';
import { NPC_PUBLIC, type NpcLocale } from './npc.ts';
import { fantasyMainGuidance, fantasyMainApproachLabel } from './fantasy-main-guidance.ts';
import { fantasyMainReady, fantasyMainStage } from './fantasy-main-trials.ts';
import { fantasyTaskObjective, fantasyTaskObjectiveLabel, fantasyTaskProgress } from './fantasy-task-progress.ts';
import { fantasyCampingKit } from './fantasy-camping.ts';
import { fantasyEncounterChoiceStat, fantasyHostileEncounter } from './fantasy-encounters.ts';
import { fantasyCombatStat } from './fantasy-equipment.ts';
import { fantasyEscortGuidance } from './fantasy-escort-guidance.ts';
import { fantasyVoyageGuidance } from './fantasy-voyage-guidance.ts';

type Locale = 'ko' | 'en';
const STATS: Record<FantasyStat, [string, string]> = {
  strength: ['힘', 'Strength'], agility: ['민첩', 'Agility'], intelligence: ['지능', 'Intelligence'],
  luck: ['운', 'Luck'], vitality: ['체력', 'Vitality'], dexterity: ['손재주', 'Dexterity'], charisma: ['카리스마', 'Charisma'],
};
const TRANSPORTS: Record<string, [string, string]> = {
  foot: ['도보', 'On foot'], carriage: ['합승 마차', 'Shared carriage'], ship: ['도보 및 정기선', 'On foot and ferry'],
  'working-ship': ['도보 및 선원 일손 돕기', 'On foot and working passage'], airship: ['비공정', 'Airship'], gate: ['전이문', 'Gate'],
  escort: ['의뢰받은 호위 동행', 'Assigned caravan escort'],
};

/** 予約済みの内容だけを説明し、未確定の成果や未発見の地名は補わない。 */
export function fantasyGmActivityName(profile: FantasyProfile, locale: NpcLocale): string {
  const a = profile.activity?.action, c = profile.character;
  const say = (ko: string, en: string, ja: string) => ({ ko, en, ja })[locale];
  if (!a || !c) return say('예약된 행동', 'performing the reserved action', '予約された行動');
  const name = (id: string) => FANTASY_MAPS.find(map => map.item === id)?.name[locale] ?? fantasyTermName(id, locale);
  const place = (id: string) => fantasyKnownLocations(c).includes(id) ? name(id) : say('미발견 지역', 'an undiscovered region', '未発見の地域');
  const job = (id: string) => FANTASY_JOBS.find(value => value.id === id)?.names[locale] ?? name(id);
  switch (a.type) {
    case 'travel': return say(`${place(a.destination)}까지 이동`, `traveling to ${place(a.destination)}`, `${place(a.destination)}への移動`);
    case 'work': { const selected = a.career === 'life' ? fantasyLifeJob(c) ?? c.job : c.job; return say(`${job(selected)} 일`, `working as ${job(selected)}`, `${job(selected)}の仕事`); }
    case 'job': return say(`${job(a.job)} 수련`, `training as ${job(a.job)}`, `${job(a.job)}の修練`);
    case 'advanceJob': return say('전문 분야 수련', 'training in a specialty', '専門分野の修練');
    case 'priestBranch': return say('성소에서 길을 배우기', 'learning a sacred path', '聖所で道を学ぶ修練');
    case 'propertyUse': return say('내 부동산에서 활동', 'working or resting at your property', '自分の不動産での活動');
    case 'learn': {
      const skill = fantasyNpcMentorSkills(a.npcId, c).find(skill => skill.id === a.skill);
      const title = skill ? fantasySkillName(skill, locale) : say('기술', 'a skill', '技能');
      const teacher = NPC_PUBLIC.find(npc => npc.id === a.npcId)?.name[locale] ?? say('현지 스승', 'the local mentor', '現地の師匠');
      return say(`${teacher}에게 ${title} 배우기`, `learning ${title} from ${teacher}`, `${teacher}から${title}を学ぶ修練`);
    }
    case 'explore': return say(`${place(c.location)} 탐사`, `exploring ${place(c.location)}`, `${place(c.location)}の探索`);
    case 'investigate': return fantasyMainStage(c, a.quest)?.labels[locale] ?? say('의뢰 현장 조사', 'investigating quest evidence', '依頼の現地調査');
    case 'gather': return locale === 'en' ? ({ herbs: 'gathering herbs', wood: 'gathering timber', minerals: 'mining minerals', gems: 'mining gems' })[a.resource] : FANTASY_GATHERING_NAMES[a.resource][locale];
    case 'hunt': {
      const monster = FANTASY_MONSTERS.find(monster => monster.id === a.monster);
      const target = monster?.names[locale] ?? say('현지 사냥감', 'local prey', '現地の獲物');
      return say(`${target} 사냥`, `hunting ${target}`, `${target}の狩猟`);
    }
    case 'skin': {
      const target = FANTASY_MONSTERS.find(monster => monster.id === c.carcass?.monster)?.names[locale] ?? say('확보한 사체', 'the recovered carcass', '確保した獲物');
      return say(`${target} 해체·가죽 회수`, `skinning ${target}`, `${target}の解体・皮の回収`);
    }
    case 'fish': return a.mode === 'sea' ? say('바다 낚시', 'fishing at sea', '海での釣り') : say('부두 낚시', 'fishing from the pier', '桟橋での釣り');
    case 'boat': return a.mode === 'buy' ? say('어선 구매', 'buying a fishing boat', '漁船の購入') : say('어선 임대', 'renting a fishing boat', '漁船の賃借');
    case 'terrain': {
      const activity = FANTASY_TERRAIN_ACTIVITIES.find(activity => activity.id === a.activity)?.names[locale];
      return activity ? say(activity, `performing ${activity}`, activity) : say('현지 지형 활동', 'performing the local terrain activity', '現地の地形活動');
    }
    case 'craft': {
      const recipe = FANTASY_RECIPES.find(recipe => recipe.id === a.recipe);
      const target = recipe ? name(recipe.output) : say('품목', 'the selected item', '選択した品物');
      return say(`${target} 제작`, `crafting ${target}`, `${target}の制作`);
    }
    case 'lodge': {
      const room = FANTASY_LODGINGS.find(room => room.id === a.room)?.name[locale] ?? say('객실', 'a guest room', '客室');
      return say(`${room} 숙박`, `staying in ${room}`, `${room}での宿泊`);
    }
    case 'eat': {
      const meal = FANTASY_DINING.find(meal => meal.id === a.meal)?.name[locale] ?? say('주문한 음식', 'the ordered meal', '注文した食事');
      return say(`${meal} 식사`, `eating ${meal}`, `${meal}の食事`);
    }
    case 'rest': return say('야영', 'camping', '野宿');
    case 'haggle': return a.service === 'goods' ? say('물품 가격 흥정', 'negotiating goods prices', '品物の値段交渉')
      : a.service === 'room' ? say('객실 가격 흥정', 'negotiating room prices', '客室代の交渉') : say('식사 가격 흥정', 'negotiating meal prices', '食事代の交渉');
    case 'read': {
      const book = FANTASY_LIBRARY_BOOKS.find(book => book.id === a.book)?.title[locale] ?? say('선택한 책', 'the selected book', '選択した本');
      return say(`『${book}』 읽기`, `reading ${book}`, `『${book}』の読書`);
    }
    case 'command': {
      const group = a.kind === 'troop' ? say('부대', 'company', '部隊') : a.kind === 'syndicate' ? say('조직', 'organization', '組織') : say('소환 계약', 'summoning contracts', '召喚契約');
      const member = FANTASY_COMPANIONS.find(member => member.id === a.member)?.names[locale] ?? group;
      switch (a.operation) {
        case 'hire': return a.kind === 'summons' ? say(`${member} 소환 계약 체결`, `forming a summoning contract with ${member}`, `${member}との召喚契約`)
          : say(`${member} 고용`, `hiring ${member}`, `${member}の雇用`);
        case 'assign': return say(`${member} 동행 편성`, `assigning ${member} to the party`, `${member}の同行編成`);
        case 'dismiss': return say(`${member} 고용·계약 해제`, `ending the agreement with ${member}`, `${member}の雇用・契約解除`);
        case 'mission': return say(`${group} 현지 임무 수행`, `carrying out a local ${group} mission`, `${group}の現地任務`);
        case 'recover': return say(`${member} 부상 치료`, `treating ${member}'s injuries`, `${member}の負傷治療`);
        case 'recontract': return say(`${member} 복귀 계약`, `recontracting with ${member}`, `${member}の復帰契約`);
      }
    }
    case 'magicPrepare': {
      const combination = FANTASY_MAGIC_COMBINATIONS.find(value => value.element === a.element && value.form === a.form)?.names[locale];
      const element = FANTASY_MAGIC_ELEMENTS.find(value => value.id === a.element)?.names[locale] ?? '';
      const form = FANTASY_MAGIC_FORMS.find(value => value.id === a.form)?.names[locale] ?? '';
      const target = combination ?? `${element} ${form}`.trim();
      return say(`마법 ${a.slot}번 칸에 ${target} 준비`, `preparing ${target} in spell slot ${a.slot}`, `魔法の${a.slot}枠目に${target}を準備`);
    }
    case 'magicCast': return say(`${a.slot}번 칸 저장 마법 발동`, `casting the saved spell in slot ${a.slot}`, `${a.slot}枠目の保存魔法の発動`);
    case 'alchemy': {
      const formula = FANTASY_ALCHEMY_FORMULAS.find(formula => formula.id === a.formula)?.names[locale] ?? say('선택한 조합', 'the selected formula', '選択した調合');
      return say(`연금술: ${formula}`, `performing alchemy: ${formula}`, `錬金術：${formula}`);
    }
    case 'event': {
      const event = FANTASY_EVENTS.find(event => event.id === profile.event);
      if (!event || !fantasyEventEligible(c, event)) return say('이벤트 선택 판정', 'resolving the event choice', 'イベントの選択肢の判定');
      const translated = fantasyEventText(event, locale);
      const choice = translated.choices[a.choice];
      return say(`${translated.name}: ${choice ?? '선택지'} 판정`, `resolving ${translated.name}: ${choice ?? 'the selected choice'}`, `${translated.name}：${choice ?? '選択肢'}の判定`);
    }
    case 'manaTrain': return FANTASY_MANA_EXERCISES.find(exercise => exercise.id === a.exercise)?.names[locale] ?? say('이전 마나 수련', 'performing legacy mana training', '以前のマナ修練');
    default: return say('예약된 행동', 'performing the reserved action', '予約された行動');
  }
}

export function fantasyGmLocalized(profile: FantasyProfile, source: FantasyGmSourceReply, locale: Locale): FantasyGmReply {
  const ko = locale === 'ko';
  const say = (korean: string, english: string) => ko ? korean : english;
  const name = (id: string) => FANTASY_MAPS.find(map => map.item === id)?.name[locale] ?? fantasyTermName(id, locale);
  const stat = (id: FantasyStat) => STATS[id][ko ? 0 : 1];
  const job = (id: string) => FANTASY_JOBS.find(value => value.id === id)?.names[locale] ?? name(id);
  const transportName = (id: string) => TRANSPORTS[id]?.[ko ? 0 : 1] ?? id;
  const c = profile.character;
  const known = c ? fantasyKnownLocations(c) : [];
  const place = (id: string) => known.includes(id) ? name(id) : say('미발견 지역', 'an undiscovered region');
  const has = (id: string) => !!c && fantasyBuildings(c).some(building => building.id === id);
  const timeCost = (cost: number, hours: number) => say(`금화 ${cost} · ${hours}시간`, `${cost} gold · ${hours} game hours`);
  const questName = (id: string) => {
    const quest = FANTASY_QUESTS.find(value => value.id === id);
    return quest ? fantasyQuestText(quest, locale).name : id;
  };
  const effect = (skill: FantasySkill) => {
    if (skill.id === 'cook-sense') return say('음식을 살피고 냄새를 맡아 신선도와 경과 시간·보존 기간을 판단합니다.', 'Inspect food and smell it to judge freshness, age and shelf life.');
    const next = skill.kind === 'active' ? say('다음 해당 행동: ', 'Next matching action: ') : '';
    switch (skill.effect) {
      case 'check': return `${next}${skill.stat ? stat(skill.stat) : say('능력', 'ability')} +${skill.power}`;
      case 'heal': return say(`HP ${skill.power} 회복 (최대 HP까지)`, `Restore ${skill.power} HP, capped at maximum HP`);
      case 'guard': return `${next}${say(`피해 ${skill.power} 감소 (최소 0)`, `reduce damage by ${skill.power}, minimum 0`)}`;
      case 'reward': return `${next}${say(`일·채집 성과 +${skill.power}`, `work and gathering rewards +${skill.power}`)}`;
      case 'travel': return `${next}${say(`이동 시간 ${skill.power}시간 단축 (최소 1시간)`, `travel ${skill.power} hours faster, minimum 1 hour`)}`;
    }
  };
  const recovery = () => {
    const kit = fantasyCampingKit(c!);
    const camp = say(`무료 야영은 8시간 동안 최대 HP의 20%, MP의 ${Math.round(kit.mp * 100)}%를 회복하고 피로를 ${kit.fatigue} 낮춥니다. 현재 장비로 불상사 위험이 ${Math.round((1 - kit.riskMultiplier) * 100)}% 줄지만 도난·습격 위험은 남습니다.`,
      `Free camping takes 8 game hours, restores 20% of maximum HP and ${Math.round(kit.mp * 100)}% of MP, and reduces fatigue by ${kit.fatigue}. Current equipment reduces incident risk by ${Math.round((1 - kit.riskMultiplier) * 100)}%, with theft or attack still possible.`);
    const rooms = has('inn') ? FANTASY_LODGINGS.map(room => `${room.name[locale]}: ${timeCost(room.cost, room.hours)}, HP +${Math.round(room.hpRecovery * 100)}%, MP +${Math.round(room.mpRecovery * 100)}%, ${say('피로', 'fatigue')} -${room.fatigueRecovery}`).join('\n')
      : say('현재 지역에는 여관이 없습니다.', 'There is no inn here.');
    return `${camp}\n${rooms}\n${say('시간이 지나면 배고픔도 증가합니다.', 'Hunger also increases as game time passes.')}`;
  };
  const suggestion = (original: FantasyGmReply['suggestions'][number]): FantasyGmReply['suggestions'][number] => {
    const a = original.action;
    let label: string;
    if (original.location) label = known.includes(original.location) ? say(`${name(original.location)} 지도에서 선택`, `Select ${name(original.location)} on the map`) : say('인접한 미답 지역 선택', 'Select the adjacent unexplored region');
    else if (!a) {
      const tabs = { location: ['현재 지역과 이동', 'Location and travel'], quests: ['의뢰', 'Quests'], inventory: ['소지품과 제작', 'Inventory and crafting'], skills: ['스킬', 'Skills'], jobs: ['직업', 'Professions'], journal: ['모험 기록', 'Adventure journal'], buildings: ['시설 방문', 'Visit buildings'] };
      label = original.tab ? tabs[original.tab][ko ? 0 : 1] : say('확인', 'View');
    } else {
      switch (a.type) {
        case 'manaTrain': {
          const exercise = FANTASY_MANA_EXERCISES.find(exercise => exercise.id === a.exercise)!;
          label = say(`${exercise.names.ko} 시작 (MP${exercise.mpCost} · 실제 ${exercise.hours * 60 / FANTASY_WORLD_TIME_RATE}분)`, `Start ${exercise.names.en} (MP${exercise.mpCost} · ${exercise.hours * 60 / FANTASY_WORLD_TIME_RATE} real minutes)`); break;
        }
        case 'draw': label = say(`종족 추첨 (${profile.draft.remaining}회 남음)`, `Draw a race (${profile.draft.remaining} remaining)`); break;
        case 'keep': label = say(`${name(profile.draft.candidate ?? '')} 킵`, `Keep ${name(profile.draft.candidate ?? '')}`); break;
        case 'skip': label = say('이번 후보 넘기기', 'Pass this candidate'); break;
        case 'work': { const selected = a.career === 'life' ? fantasyLifeJob(c!) ?? c!.job : c!.job; label = say(`${job(selected)} 일하기 (무료 · 실제 ${240 / FANTASY_WORLD_TIME_RATE}분)`, `Work as ${job(selected)} (free · ${240 / FANTASY_WORLD_TIME_RATE} real minutes)`); break; }
        case 'explore': label = say('현재 지역 탐사 (3시간)', 'Explore here (3 game hours)'); break;
        case 'investigate': {
          const stage = c && fantasyMainStage(c, a.quest);
          label = `${fantasyMainApproachLabel(stage?.kind ?? 'field', a.approach, locale)} · ${say('실제 약 1분', 'about 1 real minute')}`; break;
        }
        case 'rest': label = say('야영 (무료 · 8시간 · 위험 있음)', 'Camp (free · 8 game hours · risky)'); break;
        case 'lodge': {
          const room = FANTASY_LODGINGS.find(value => value.id === a.room)!;
          label = `${room.name[locale]} (${timeCost(room.cost, room.hours)})`; break;
        }
        case 'eat': {
          const meal = FANTASY_DINING.find(value => value.id === a.meal)!;
          label = `${meal.name[locale]} (${timeCost(meal.cost, meal.hours)})`; break;
        }
        case 'travel': {
          const transport = c && fantasyTransports(c, a.destination).find(value => value.id === a.transport);
          label = `${transportName(a.transport)}${transport ? ` (${timeCost(transport.cost, transport.hours)})` : ''}`; break;
        }
        case 'job': label = say(`${job(a.job)} 배우기 (무료 · 실제 ${60 / FANTASY_WORLD_TIME_RATE}분)`, `Learn ${job(a.job)} (free · ${60 / FANTASY_WORLD_TIME_RATE} real minutes)`); break;
        case 'escortAccept': label = say(`${place(a.destination)} 호위 배정받기`, `Accept escort to ${place(a.destination)}`); break;
        case 'finishVoyage': label = say('항해 일지 완성', 'Complete voyage journal'); break;
        case 'escortAbandon': label = say('호위 배정 포기', 'Abandon escort assignment'); break;
        case 'accept': label = say(`${questName(a.quest)} 수락`, `Accept ${questName(a.quest)}`); break;
        case 'complete': label = FANTASY_QUESTS.find(q=>q.id===a.quest)?.completionLabel?.[locale] ?? say(`${questName(a.quest)} 납품`, `Deliver ${questName(a.quest)}`); break;
        case 'skill': {
          const skill = c && fantasySkills(c).find(value => value.id === a.skill);
          label = skill ? `${fantasySkillName(skill, locale)} (MP ${skill.mp})` : a.skill; break;
        }
        case 'craft': {
          const recipe = FANTASY_RECIPES.find(value => value.id === a.recipe)!;
          label = say(`${name(recipe.output)} 제작 (3시간 · DC${recipe.dc})`, `Craft ${name(recipe.output)} (3 game hours · DC${recipe.dc})`); break;
        }
        case 'buy': label = say(`${name(a.item)} 1개 구매`, `Buy 1 ${name(a.item)}`); break;
        case 'event': {
          const event = FANTASY_EVENTS.find(value => value.id === profile.event)!;
          const choice = event.choices.find(value => value.id === a.choice)!;
          label = `${fantasyEventText(event, locale).choices[a.choice]} (${stat(fantasyEncounterChoiceStat(event.id, choice.id, fantasyCombatStat(c!)) ?? choice.stat)} DC${choice.dc})`; break;
        }
        default: label = say('행동 선택', 'Choose action');
      }
    }
    return { ...original, label };
  };
  const suggestions = source.suggestions.map(suggestion);
  let text: string;
  if (!c) {
    text = say(`캐릭터를 먼저 생성해 주세요. 기본 종족은 인간이며 성별을 선택할 수 있습니다. 종족 추첨은 ${profile.draft.remaining}회 남았습니다. 생성 후 무직으로 시작하고 길드·NPC·GM과의 대화로 직업을 배웁니다.`,
      `Create your character first. Human is the default race and you can choose a gender. You have ${profile.draft.remaining} race draws left. You start unassigned and learn a profession through a guild, NPC or GM conversation.`);
    if (profile.draft.candidate) text += say(` 현재 후보: ${name(profile.draft.candidate)}. 바로 생성하거나 킵·넘기기를 선택할 수 있습니다.`, ` Current candidate: ${name(profile.draft.candidate)}. Create now, keep it, or pass.`);
    if (profile.draft.kept) text += say(` 킵한 종족: ${name(profile.draft.kept)}.`, ` Kept race: ${name(profile.draft.kept)}.`);
    return { text, suggestions };
  }
  const location = FANTASY_LOCATIONS.find(value => value.id === c.location);
  const lifeJob = fantasyLifeJob(c);
  const careerNames = lifeJob && lifeJob !== c.job ? `${job(c.job)} · ${say('생활 직업', 'life career')} ${job(lifeJob)}` : job(c.job);
  switch (source.topic) {
    case 'invalid': text = say('현재 기록의 지역·직업 또는 이벤트를 확인할 수 없습니다. 다시 연결하여 최신 기록을 받아 주세요.', 'The location, profession or event in this record is unavailable. Reconnect to obtain the latest record.'); break;
    case 'activity': {
      const remaining = Math.max(0, profile.activity!.endsAt - c.hour);
      const realMinutes = (remaining * 60 / FANTASY_WORLD_TIME_RATE).toFixed(1);
      const activity = fantasyGmActivityName(profile, locale);
      text = say(`지금은 ${activity} 중입니다. 현재 직업은 ${careerNames}입니다. 완료까지 게임 시간 약 ${remaining.toFixed(2)}시간, 실제 시간 약 ${realMinutes}분 남았습니다. 완료 후 결과가 기록됩니다.`, `You are ${activity}. Your current profession is ${careerNames}. About ${remaining.toFixed(2)} game hours (${realMinutes} real minutes) remain. The result is recorded when it finishes.`); break;
    }
    case 'event': {
      const event = FANTASY_EVENTS.find(value => value.id === profile.event)!;
      const translated = fantasyEventText(event, locale);
      text = `${translated.name}\n${translated.description}\n${event.choices.map(choice => {
        const bonus = choice.context ? fantasyContextBonus(c, choice.context) : 0;
        return `${translated.choices[choice.id]}: ${stat(fantasyEncounterChoiceStat(event.id, choice.id, fantasyCombatStat(c)) ?? choice.stat)} DC${choice.dc}${choice.context ? ` · ${FANTASY_CONTEXT_NAMES[choice.context][locale]} · ${say('신체 보정', 'body modifier')} ${bonus >= 0 ? '+' : ''}${bonus}` : ''}`;
      }).join('\n')}\n${say(`아직 선택하지 않았습니다. 원하는 선택을 말하고 확인하면 게임 내 ${fantasyHostileEncounter(event.id) ? .5 : 2}시간의 행동을 시작합니다.`, `No choice has been made. State your choice and confirm to begin a ${fantasyHostileEncounter(event.id) ? .5 : 2} game-hour action.`)}`; break;
    }
    case 'library': text = has('library') ? say('현재 지역의 도서관에서 소장 중인 책을 읽을 수 있습니다.', 'You can read the books held by the local library.') : say('자세한 지식은 도서관의 책에서 확인할 수 있습니다.', 'Detailed knowledge is available in library books.'); break;
    case 'log': {
      const failure = source.subject === 'failure';
      const records = profile.log.filter(entry => failure ? entry.kind === 'failure' : /d20=/.test(entry.text)).slice(-3);
      text = records.length ? `${say('모험 기록에 남은 원문입니다.', 'These are the original journal records.')}\n${records.map(entry => `${entry.hour}h: ${entry.text}`).join('\n')}\n${say('기록에 없는 원인은 단정할 수 없습니다. d20과 능력·숙련·스킬 보정으로 판정합니다.', 'Causes absent from the record cannot be assumed. Checks use d20 plus ability, proficiency and skill modifiers.')}`
        : say(`아직 ${failure ? '실패' : '판정'} 기록이 없습니다. 실제 행동 후 기록됩니다.`, `There are no ${failure ? 'failure' : 'check'} records yet. Results are recorded after an action.`); break;
    }
    case 'status': {
      const stats = fantasyStats(c);
      const gender = c.gender === 'female' ? say('여성', 'female') : c.gender === 'male' ? say('남성', 'male') : say('성별 없음', 'no gender');
      text = `${c.name} / ${name(c.race)} / ${gender} / ${careerNames} Lv.${c.level}\nHP ${c.hp}/${stats.hp} · MP ${c.mp}/${stats.mp} · ${say('금화', 'Gold')} ${c.gold}\n${say('피로', 'Fatigue')} ${c.fatigue} · ${say('배고픔', 'Hunger')} ${c.hunger}\n${Object.entries(stats).filter(([key]) => key !== 'hp' && key !== 'mp').map(([key, value]) => `${stat(key as FantasyStat)} ${value}`).join(' · ')}`; break;
    }
    case 'skills': {
      const stats = fantasyStats(c);
      text = `MP ${c.mp}/${stats.mp}\n${fantasySkills(c).map(skill => `${fantasySkillName(skill, locale)} [${skill.kind === 'passive' ? say('패시브 · 상시', 'passive · always on') : `active · MP${skill.mp}`}]: ${effect(skill)}${skill.kind === 'active' && c.mp < skill.mp ? say(' (MP 부족)', ' (not enough MP)') : ''}`).join('\n')}\n${c.buff ? say('일시 강화가 적용 중입니다. 해당 행동에 사용하거나 휴식으로 해제할 수 있습니다.', 'A temporary buff is active. Use it on a matching action or clear it by resting.') : say('액티브 스킬은 이름을 말하고 사용을 확인하면 MP를 소모합니다.', 'Name an active skill and confirm its use to spend MP.')}\n${recovery()}`; break;
    }
    case 'mana': {
      const mana = fantasyMana(c);
      text = say(`마나 단계 ${mana.stage}/4 · 제어 ${mana.mastery} · 과부하 ${mana.strain}/100.`, `Mana stage ${mana.stage}/4 · control ${mana.mastery} · strain ${mana.strain}/100.`)
        + '\n' + (source.detail ? FANTASY_MANA_PRINCIPLES.map(principle => `${principle.names[locale]}: ${principle.description[locale]}`).join('\n') : FANTASY_MANA_PRINCIPLES.map(principle => principle.names[locale]).join(' → '))
        + '\n' + say('마나는 모든 직업에서 실제로 효과를 낸 MP 사용으로 성장합니다. 판정·방호 강화는 사용되어 소모될 때, 회복은 실제 HP가 회복될 때 경험이 쌓입니다. 같은 행동을 반복하면 성장량이 줄고, 실패도 소량의 경험을 줍니다. 별도 강화 수련을 시작할 필요는 없습니다.', 'Every profession grows mana through effective MP use. Check and guard buffs earn experience when consumed; healing does so when HP is actually restored. Repeated actions give less growth, while failure gives a small amount. No separate enhancement training is needed.'); break;
    }
    case 'specialization': text = fantasySpecializationSummary(c, locale); break;
    case 'gathering': text = say('채광·약초 채집·벌목·사냥·낚시는 현재 지역의 자원과 도구를 확인해 선택합니다. 낚시는 장비와 선박 조건도 확인하세요. 품질은 재료와 숙련이 중심이며 같은 행동의 반복은 성장량이 줄어듭니다. 미발견 지역의 자원은 아직 모릅니다.', 'Choose mining, herb gathering, logging, hunting or fishing after checking local resources and tools. Fishing may require suitable gear and a boat. Materials and proficiency chiefly determine quality; repeated actions give less growth. Undiscovered regional resources remain unknown.'); break;
    case 'mortality': text = profile.death ? say('이 삶은 끝났습니다. 이전 삶의 기록을 확인하고 새 인물로 출발할 수 있습니다. 소지품과 숙련을 그대로 이어받는 행동은 아닙니다.', 'This life has ended. Review its record and begin as a new person. This does not carry over your inventory and proficiency.') : say('위험한 곳에서 HP를 잃으면 지역과 동료 조건에 따라 구조되지 못하고 사망할 수 있습니다. 기록을 남기고 새 인물로 다시 시작합니다.', 'Losing HP in a dangerous place may lead to death rather than rescue, depending on location and companions. The record remains and you can begin a new life.'); break;
    case 'dining': text = `${say('현재 배고픔', 'Current hunger')}: ${c.hunger}.\n${has('inn') || has('restaurant') ? FANTASY_DINING.map(meal => `${meal.name[locale]}: ${timeCost(meal.cost, meal.hours)}, ${say('배고픔', 'hunger')} -${meal.nutrition}`).join('\n') : say('현재 지역에는 식사를 주문할 여관·식당이 없습니다. 소지한 음식을 확인해 주세요.', 'There is no inn or restaurant serving meals here. Check the food in your inventory.')}`; break;
    case 'recovery': text = recovery(); break;
    case 'inventory': {
      const items = Object.entries(c.inventory).filter(([, amount]) => amount > 0).map(([id, amount]) => `${name(id)} ×${amount}`);
      text = `${say('금화', 'Gold')} ${c.gold}. ${say('소지품', 'Inventory')}: ${items.join(', ') || say('없음', 'empty')}.\n${say('상점마다 취급하는 물품이 다릅니다. 제작에는 직업·시설·재료가 필요합니다.', 'Each shop has its own stock. Crafting requires the matching profession, facility and materials.')}`; break;
    }
    case 'jobs': {
      const selected = FANTASY_JOBS.find(value => value.id === source.subject);
      if (selected) {
        const summary = (FANTASY_TERMS.find(value => value.id === selected.id)?.summary[locale] ?? '').split('. ')[0].replace(/[.。]+$/, '');
        text = fantasyHasJob(c, selected.id) ? say(`이미 ${job(selected.id)}입니다. 다시 배울 필요가 없습니다.`, `You are already ${job(selected.id)}. You do not need to learn it again.`)
          : selected.category === 'none' ? say('새 캐릭터는 무직으로 시작합니다. 배우고 싶은 직업을 알려주세요.', 'New characters start unassigned. Tell me which profession you want to learn.')
            : selected.id === 'priest' && !canAcquireJob(c, selected.id, 'gm') ? say('사제는 해당 신전의 신을 섬기는 성직자입니다. 사제 수련은 현재 지역에 신전이 있어야 합니다. 신전의 사제를 찾아가 주세요.', 'A priest serves the deity venerated at their temple. Priest training requires a temple in your current region. Visit a temple priest.')
              : say(`${job(selected.id)}: ${summary}. ${job(selected.id)} 수련을 시작할까요? 무료이며 게임 1시간, 실제 ${60 / FANTASY_WORLD_TIME_RATE}분이 걸립니다.`, `${job(selected.id)}: ${summary}. Start ${job(selected.id)} training? It is free and takes 1 game hour (${60 / FANTASY_WORLD_TIME_RATE} real minutes).`);
      } else text = say(`현재 직업은 ${careerNames}입니다. 일하기는 무료이며 게임 4시간, 실제 ${240 / FANTASY_WORLD_TIME_RATE}분이 걸립니다. 완료 후 판정 결과와 임금이 기록됩니다.`, `Your current profession is ${careerNames}. Work is free and takes 4 game hours (${240 / FANTASY_WORLD_TIME_RATE} real minutes). The check and wages are recorded on completion.`);
      break;
    }
    case 'craft': {
      const recipes = FANTASY_RECIPES.filter(recipe => fantasyHasJob(c, recipe.job));
      const facility = fantasyCraftFacility(lifeJob ?? c.job);
      text = recipes.length ? recipes.map(recipe => {
        const missing = Object.entries(recipe.inputs).filter(([id, count]) => (c.inventory[id] ?? 0) < count).map(([id, count]) => `${name(id)} ×${count - (c.inventory[id] ?? 0)}`);
        const materials = Object.entries(recipe.inputs).map(([id, count]) => `${name(id)} ×${count} (${say('보유', 'held')} ${c.inventory[id] ?? 0})`).join(', ');
        return `${materials} → ${name(recipe.output)} ×${recipe.count}. ${stat(FANTASY_JOBS.find(value => value.id === recipe.job)!.stat)} DC${recipe.dc} · ${say('3시간', '3 game hours')}. ${!facility || !has(facility) ? say('현재 지역에 필요한 제작 시설이 없습니다.', 'The required crafting facility is unavailable here.') : missing.length ? `${say('부족', 'Missing')}: ${missing.join(', ')}` : fantasyCanCraft(c, recipe) ? say('제작할 수 있습니다. 결과는 실행 후 판정합니다.', 'Ready to craft. The outcome is checked after confirmation.') : say('지도를 그리는 데 필요한 지역 정보를 아직 모릅니다.', 'You do not yet know the areas needed to copy this map.')}`;
      }).join('\n') : say(`${job(c.job)}의 제작법은 없습니다. 요리사·대장장이·연금술사 등 제작 직업을 배울 수 있습니다.`, `${job(c.job)} has no crafting recipes. You can learn a crafting profession such as cook, blacksmith or alchemist.`); break;
    }
    case 'quests': {
      if (source.subject === 'voyage') { text = fantasyVoyageGuidance(c, locale); break; }
      if (source.subject === 'escort') { text = fantasyEscortGuidance(c, locale).text; break; }
      if (source.subject === 'board') { text = say('일반 의뢰는 현재 지역 길드의 기한이 있는 게시판에서 받습니다. 의뢰인은 실제 주민이며 일반 의뢰는 한 플레이어가 선점하고, 대규모 토벌만 공동 참가합니다. 게시·납품 기한을 확인해 주세요.', 'Accept ordinary contracts from the local guild’s timed board. Real residents issue them; ordinary offers have one claimant, while only large raids allow joint participation. Check posting and delivery deadlines.'); break; }
      const requested = FANTASY_QUESTS.find(value => value.id === source.subject);
      const recorded = (quest: typeof FANTASY_QUESTS[number]) => fantasyQuestRecordEligible(c, quest) && (c.quests.includes(quest.id) || c.completed.includes(quest.id));
      if (requested && !fantasyQuestEligible(c, requested) && !recorded(requested)) {
        text = say('이 의뢰의 참가 조건을 충족하지 않습니다. 현재 지역에서 받을 수 있는 의뢰를 확인해 주세요.', 'You do not meet this quest’s participation requirements. Check the quests available here.'); break;
      }
      if (requested && !c.quests.includes(requested.id) && !c.completed.includes(requested.id) && requested.giver !== c.location) {
        text = say('아직 수락하지 않은 다른 지역의 의뢰입니다. 현재 지역의 의뢰를 확인해 주세요.', 'That remote quest has not been accepted. Check the quests available here.'); break;
      }
      const quests = requested ? [requested] : FANTASY_QUESTS.filter(value => recorded(value) && c.quests.includes(value.id)
        || fantasyPersonalQuest(value) && fantasyQuestEligible(c, value) && value.giver === c.location && !c.completed.includes(value.id));
      text = quests.length ? quests.map(quest => {
        const reportAt = quest.reportAt ?? quest.giver;
        if (quest.id === 'main-night-18' && c.completed.includes(quest.id) && !c.voyageEnding) return fantasyVoyageGuidance(c, locale);
        if (c.completed.includes(quest.id)) return `${questName(quest.id)}: ${say('이미 완료했습니다. 다시 수령할 수 없습니다.', 'Already completed. Rewards cannot be claimed twice.')}`;
        if (!fantasyQuestEligible(c, quest)) return `${questName(quest.id)}: ${say('수락 기록은 유지됩니다. 납품하려면 의뢰에서 지정한 직업으로 돌아와야 합니다.', 'Your accepted record remains. Return to the required profession before delivering this quest.')}`;
        const contract = c.contracts?.[quest.id];
        if (contract && contract.expiresAt <= c.hour) return `${questName(quest.id)}: ${say('납품 기한이 지났습니다. 받은 의뢰 목록에서 포기할 수 있습니다.', 'The delivery deadline passed. You can abandon it from your accepted contracts.')}`;
        const task = fantasyTaskObjective(quest);
        if (task) return `${questName(quest.id)}: ${fantasyTaskObjectiveLabel(quest, locale)} · ${fantasyTaskProgress(c, quest)}/${task.count}. ${say(`${place(quest.destination)}에서 수락 후 실제 성공한 행동을 기록하고 ${place(reportAt)}에 보고하세요. 획득물은 보관합니다.`, `Record successful actions after acceptance at ${place(quest.destination)}, then report at ${place(reportAt)}. Keep the goods you obtain.`)}`;
        if (quest.objective?.type === 'hunt') return `${questName(quest.id)}: ${say('토벌', 'Hunt progress')} ${contract?.progress ?? 0}/${quest.objective.count}. ${c.location !== reportAt ? say(`${place(reportAt)}에서 보고하세요.`, `Report at ${place(reportAt)}.`) : say('목표를 완료하면 보고할 수 있습니다.', 'Report once the objective is complete.')}${contract ? say(` 기한: 세계 ${contract.expiresAt}시간.`, ` Deadline: world hour ${contract.expiresAt}.`) : ''}`;
        const held = c.inventory[quest.item] ?? 0;
        const missing = [];
        if (quest.chapter && !fantasyMainReady(c, quest.id)) missing.push(fantasyMainGuidance(c, quest.id, locale)!);
        if (held < quest.count) missing.push(say(`${name(quest.item)} ${quest.count - held}개 부족`, `missing ${quest.count - held} ${name(quest.item)}`));
        if (!c.visited.includes(quest.destination)) missing.push(say('지정 지역 미방문', 'destination not yet visited'));
        if (c.location !== reportAt) missing.push(say('의뢰인에게 돌아가야 함', 'return to the quest giver'));
        const destination = FANTASY_LOCATIONS.find(value => value.id === quest.destination)!;
        const acquisition = held >= quest.count ? '' : !known.includes(destination.id) ? say('해당 지역의 자원은 아직 모릅니다. 인접 지역을 탐사하거나 지도를 구해 사용해 주세요.', 'Its resources are not known yet. Explore neighboring regions or obtain and use a map.')
          : destination.resources.includes(quest.item) ? say(`${place(destination.id)}에서 탐사로 구할 수 있습니다.`, `Exploring ${place(destination.id)} may yield it.`)
            : say('지정 지역 탐사로 자동 획득되는 물품이 아닙니다. 취급 상점에서 구매하거나 해당 직업·제작법을 확인해 주세요.', 'It is not automatically found by exploring the quest destination. Check a shop stocking it or the matching crafting profession and recipe.');
        return `${questName(quest.id)}: ${say(`${place(quest.destination)} 방문 후 ${name(quest.item)} ${quest.count}개를 ${place(reportAt)}에 납품`, `Visit ${place(quest.destination)}, then deliver ${quest.count} ${name(quest.item)} to ${place(reportAt)}`)}. ${say('보유', 'Held')} ${held}. ${say('기본 보상 (미수령)', 'Base reward (not received)')}: ${quest.gold} ${say('금화', 'gold')}, XP ${quest.xp}.\n${!c.quests.includes(quest.id) ? say('아직 수락하지 않았습니다.', 'Not yet accepted.') : missing.length ? missing.join(', ') : say('조건을 충족했습니다. 납품 의사를 말하고 확인하면 완료됩니다.', 'All requirements are met. Confirm delivery to complete it.')} ${acquisition}`;
      }).join('\n') : say('현재 지역에서 수락할 새 의뢰나 진행 중인 의뢰가 없습니다.', 'There are no new local or active quests.'); break;
    }
    case 'travel': {
      const destination = FANTASY_LOCATIONS.find(value => value.id === source.subject)!;
      if (!known.includes(destination.id) && !fantasyFrontierLocations(c).includes(destination.id)) { text = say('아직 지도에 없는 지역입니다. 직접 방문하거나 지도를 구해 사용하면 알 수 있습니다.', 'That region is not on your map yet. Visit it or obtain and use a map to reveal it.'); break; }
      if (destination.id === c.location) { text = say(`현재 지역은 ${name(c.location)}입니다. 채집 후보: ${destination.resources.map(name).join(', ')}.`, `You are already in ${name(c.location)}. Potential resources: ${destination.resources.map(name).join(', ')}.`); break; }
      const options = fantasyTransports(c, destination.id);
      text = `${known.includes(destination.id) ? say(`목적지는 ${name(destination.id)}입니다 (위험도 ${destination.danger}). 이동할까요?`, `Travel to ${name(destination.id)} (danger ${destination.danger})?`) : say('인접한 미답 지역으로 이동할까요? 이름과 자원은 아직 모릅니다.', 'Travel to the adjacent unexplored region? Its name and resources are unknown.')}
${options.map(option => {
        let reason = option.available ? say('이용 가능', 'available') : !option.path.length ? say('이동 경로 없음', 'no route') : c.gold < option.cost ? say(`금화 ${option.cost - c.gold} 부족`, `need ${option.cost - c.gold} more gold`) : option.id === 'airship' && c.level < 3 ? say('레벨 3 필요', 'level 3 required') : option.id === 'carriage' ? say('도시에서 출발해야 함', 'must depart from a city') : option.id === 'gate' ? say('양쪽에 전이문 필요', 'gates required at both ends') : say('현재 이용 불가', 'unavailable now');
        return `${transportName(option.id)}: ${option.path.length ? timeCost(option.cost, option.hours) : say('경로 없음', 'no route')} · ${reason}`;
      }).join('\n')}
${say('여비가 부족하면 무료로 일할 수 있습니다. 바다를 건널 때는 선원 일손을 돕는 무료 이동도 확인해 주세요. 아직 이동하지 않았습니다. 이동 수단을 선택하고 확인하면 출발합니다.', 'If you lack funds, work costs no entry fee. For sea travel, check free working passage too. You have not moved. Select transport and confirm to depart.')}`; break;
    }
    case 'explore': text = `${name(c.location)}: ${say('채집 후보', 'Potential resources')} ${location!.resources.map(name).join(', ')}. ${say('탐사 3시간', 'Exploration: 3 game hours')}, ${say('위험도', 'danger')} ${location!.danger}. ${say('발견과 위험은 실행 후 판정되고 모험 기록에 남습니다.', 'Discoveries and danger are checked after confirmation and recorded in the journal.')}`; break;
    case 'location': text = say(`현재 지역은 ${name(c.location)}입니다. 게임 내 시각 ${c.hour}시간, 위험도 ${location!.danger}. 지도에서 목적지를 고르면 이용 가능한 이동 수단·비용·시간을 볼 수 있습니다.`, `You are in ${name(c.location)}. Game time: ${c.hour} hours; danger: ${location!.danger}. Select a map destination to see available transport, costs and time.`); break;
    case 'help': text = say(`현재 위치: ${name(c.location)}. 이동·직업·의뢰·기술·제작·판정을 안내합니다. 확인된 기록을 기준으로 답변하며, 행동은 내용을 확인하고 승인한 뒤 시작합니다.`, `Current location: ${name(c.location)}. Guidance is available on travel, professions, quests, skills, crafting and checks. Answers use verified records. Actions begin after review and approval.`); break;
    default: text = say('아직 이 규칙 대화로 답할 수 없는 질문입니다. 현재 위치·직업·의뢰·스킬·제작·실패 이유나 알려진 지명을 물어보세요. 기록에 없는 사건이나 보상을 만들어 확정할 수 없습니다.', 'This rule conversation cannot answer that yet. Ask about your location, professions, quests, skills, crafting, failed checks or a known destination. Unrecorded events or rewards cannot be invented.');
  }
  return { text, suggestions };
}
