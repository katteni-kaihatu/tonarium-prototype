import {fantasyWorldUtilityError} from './fantasy-world-utilities.ts';
import { fantasyHasJob, fantasyLifeJob } from './fantasy-careers.ts';
import type { FantasyAction, FantasyCharacter, FantasyEventChoice, FantasyJob, FantasyProfile, FantasyQuest, FantasySkill, FantasyStat } from './fantasy.ts';
import { FANTASY_WORLD_TIME_RATE } from './fantasy.ts';
import {
  FANTASY_EVENTS, FANTASY_ITEMS, FANTASY_JOBS, FANTASY_LOCATIONS, FANTASY_QUESTS, FANTASY_RACES,
  FANTASY_RECIPES, FANTASY_STAT_NAMES,
} from './fantasy-data.ts';
import { fantasySkills, fantasyStats, fantasyTransports } from './fantasy-engine.ts';
import { FANTASY_DINING, FANTASY_LODGINGS } from './fantasy-life.ts';
import { FANTASY_MAPS, canAcquireJob, canBuyItem, fantasyBuildings, fantasyCanCraft, fantasyCraftFacility, fantasyFrontierLocations, fantasyKnownLocations } from './fantasy-town.ts';
import type { NpcLocale } from './npc.ts';
import { fantasyGmActivityName, fantasyGmLocalized } from './fantasy-gm-locale.ts';
import { FANTASY_TERMS } from './fantasy-lore.ts';
import { fantasyEventEligible, fantasyQuestEligible, fantasyQuestRecordEligible } from './fantasy-access.ts';
import { FANTASY_CONTEXT_NAMES, fantasyContextBonus } from './fantasy-physiology.ts';
import { FANTASY_MANA_PRINCIPLES, fantasyMana } from './fantasy-mana.ts';
import { fantasySpecializationSummary } from './fantasy-specializations.ts';
import { fantasyPersonalQuest } from './fantasy-contracts.ts';
import { fantasyMainReady, fantasyMainStage } from './fantasy-main-trials.ts';
import { FANTASY_MAIN_APPROACHES, fantasyMainApproachLabel, fantasyMainGuidance } from './fantasy-main-guidance.ts';
import { fantasyTaskObjective, fantasyTaskObjectiveLabel, fantasyTaskProgress, fantasyTaskReady } from './fantasy-task-progress.ts';
import { fantasyCampingKit } from './fantasy-camping.ts';
import { fantasyEncounterChoiceStat, fantasyHostileEncounter } from './fantasy-encounters.ts';
import { fantasyCombatStat } from './fantasy-equipment.ts';
import { fantasyEscortGuidance } from './fantasy-escort-guidance.ts';
import { fantasyCanRecordVoyage, fantasyVoyageGuidance } from './fantasy-voyage-guidance.ts';
import { FANTASY_FINAL_ISLE_ID } from './fantasy-isle-access.ts';
import { fantasyVoyageClueReply } from './fantasy-voyage-knowledge.ts';
import { fantasyVoyageChoiceReply } from './fantasy-voyage-decisions.ts';
import { fantasyPrivateCareerQuestion, fantasyPrivateCareerReply } from './fantasy-career-privacy.ts';
import { fantasyGmGrowthQuestion, fantasyGmGrowthReply } from './fantasy-gm-growth.ts';

export interface FantasyGmReply {
  text: string;
  suggestions: { label: string; action?: FantasyAction; location?: string; tab?: 'location' | 'quests' | 'inventory' | 'skills' | 'jobs' | 'journal' | 'buildings' }[];
}
export interface FantasyGmChatRequest { requestId: string; text: string; locale: NpcLocale }
export interface FantasyGmChatResponse {
  requestId: string; locale: NpcLocale; reply: FantasyGmReply; source: 'rules' | 'local'; model?: string;
  error?: 'invalid' | 'busy' | 'unavailable' | 'timeout';
}
export const FANTASY_GM_TEXT_MAX = 500;

type Suggestion = FantasyGmReply['suggestions'][number];
export interface FantasyGmSourceReply extends FantasyGmReply {
  topic: 'draft' | 'invalid' | 'activity' | 'event' | 'library' | 'log' | 'quests' | 'status' | 'skills' | 'mana' | 'specialization' | 'gathering' | 'mortality' | 'dining' | 'craft' | 'travel' | 'jobs' | 'explore' | 'inventory' | 'recovery' | 'location' | 'help' | 'unknown';
  subject?: string;
  detail?: boolean;
}
const itemName = (id: string) => FANTASY_ITEMS.find(item => item.id === id)?.name ?? FANTASY_MAPS.find(map => map.item === id)?.name.ja ?? id;
const placeName = (id: string) => FANTASY_LOCATIONS.find(location => location.id === id)?.name ?? id;
const jobName = (id: string) => FANTASY_JOBS.find(job => job.id === id)?.name ?? id;
const tab = (label: string, value: Suggestion['tab']): Suggestion => ({ label, tab: value });
const knownName = (character: FantasyCharacter, id: string) => fantasyKnownLocations(character).includes(id) ? placeName(id) : '未発見の地域';
const go = (id: string, character: FantasyCharacter): Suggestion => fantasyKnownLocations(character).includes(id)
  ? { label: `${placeName(id)}を地図で選ぶ`, location: id, tab: 'location' }
  : fantasyFrontierLocations(character).includes(id) ? { label: '隣接する未踏の地域を地図で選ぶ', location: id, tab: 'location' }
    : { label: '地図を確認', tab: 'inventory' };
const reply = (text: string, suggestions: Suggestion[] = [], topic: FantasyGmSourceReply['topic'] = 'unknown', subject?: string): FantasyGmSourceReply => ({ text, suggestions, topic, subject });
const help = () => [tab('現在地と探索', 'location'), tab('依頼を確認', 'quests'), tab('職業を確認', 'jobs'), tab('スキルを確認', 'skills')];
const hasBuilding = (character: FantasyCharacter, id: string) => fantasyBuildings(character).some(building => building.id === id);
const bodyCheck = (character: FantasyCharacter, choice: FantasyEventChoice) => {
  if (!choice.context) return '';
  const bonus = fantasyContextBonus(character, choice.context);
  return `・${FANTASY_CONTEXT_NAMES[choice.context].ja}・体格補正${bonus >= 0 ? '+' : ''}${bonus}`;
};

function recovery(character: FantasyCharacter) {
  const rooms = hasBuilding(character, 'inn') ? FANTASY_LODGINGS : [];
  const kit = fantasyCampingKit(character);
  const text = `無料の8時間の野宿はHPを最大値の20%、MPを${Math.round(kit.mp * 100)}%回復し、疲労を${kit.fatigue}軽減します。装備で災難の危険を${Math.round((1 - kit.riskMultiplier) * 100)}%減らしますが盗難や襲撃の危険は残ります。一時強化は解除されます。`
    + (rooms.length ? ` 宿の客室：${rooms.map(room => `${room.name.ja}は金貨${room.cost}枚・${room.hours}時間、HP${Math.round(room.hpRecovery * 100)}%・MP${Math.round(room.mpRecovery * 100)}%回復、疲労-${room.fatigueRecovery}`).join('。')}。` : ' 現在地に宿屋はありません。')
    + ' 空腹は時間経過で進むため、必要なら食事も用意してください。';
  const suggestions: Suggestion[] = [{ label: '野宿する（無料・8時間・危険あり）', action: { type: 'rest' } },
    ...rooms.filter(room => character.gold >= room.cost).map(room => ({ label: `${room.name.ja}に泊まる（金貨${room.cost}枚・${room.hours}時間）`, action: { type: 'lodge' as const, room: room.id } }))];
  return { text, suggestions };
}

const PLACE_ALIASES: Record<string, string[]> = {
  hearth: ['ハース', '하스', '하스마을', '시작도시', '시작마을', '불꽃도시'],
  greenwood: ['翠葉', '초록숲', '녹엽의숲', '푸른숲', '숲'],
  whispergrove: ['囁き', '속삭임의정원', '속삭이는숲', '정령숲'],
  ironridge: ['鉄冠', '철관산맥', '철왕관산맥', '산맥'],
  emberhall: ['エンバーホール', '엠버홀', '대장장이도시', '제련도시'],
  deepcave: ['青晶', '청정동굴', '푸른수정동굴', '동굴'],
  sunmeadow: ['陽だまり', '햇살목초지', '목초지', '목장'],
  reedfen: ['銀葦', '은갈대습원', '은빛갈대습지', '습원'],
  tidehaven: ['潮待ち', '조수항', '물때항구', '항구'],
  suncourt: ['ソルネ', '王都', '솔네', '왕도', '왕궁'],
  oldwatch: ['見張り城', '바람의망루', '낡은망루', '옛감시성', '고성'],
  starspire: ['星詠み', '별읽는탑', '별의탑', '마법탑'],
  dawnport: ['アサギ', '東岸港', '아사기', '동해안항구', '동쪽항구'],
  mooncity: ['ルネリア', '月都', '루네리아', '달의도시', '월도'],
  duskmire: ['薄暮', '황혼의늪', '황혼늪', '늪'],
  glassdesert: ['玻璃', '유리사막', '사막'],
  ashpeak: ['燠火', '잿불화산', '불씨화산', '화산'],
  frostpass: ['白霧', '흰안개고개', '백무고개', '눈고개', '설산'],
  eclipsevault: ['月蝕', '월식의지하궁', '월식지하궁', '지하궁전'],
  'glass-isle': ['硝子珊瑚', '유리산호섬', '산호섬'],
  'drift-isle': ['漂泊', '떠도는부유섬', '떠도는섬', '부유섬', '공중섬'],
  'mushroom-isle': ['巨茸', '거대버섯섬', '버섯섬'],
  'storm-isle': ['雷鐘', '천둥종섬', '폭풍섬', '번개섬'],
  'echo-isle': ['こだま', '메아리섬', '울림섬'],
};
const JOB_ALIASES: Record<string, string[]> = {
  adventurer: ['모험가'], merchant: ['상인', '보부상', '행상'], blacksmith: ['대장장이', '단조', '鍛冶'],
  cook: ['요리사', '요리', '셰프', '料理'], alchemist: ['연금술사', '연금술', '錬金'], priest: ['사제', '성직자', '치유사', '치료사', 'healer', 'cleric', '神官', '聖職者', '僧侶', '治療師'],
  hunter: ['사냥꾼', '狩人'], bard: ['음유시인', '吟遊'], mage: ['마법사', '마술사', '魔術'], leader: ['지도자', '指導'],
  unassigned: ['무직', 'unassigned', 'unemployed', '無職'],
  thief: ['도둑', 'thief', '盗賊', '泥棒'], smuggler: ['밀수업자', '밀수꾼', 'smuggler', '密輸人'],
  assassin: ['암살자', 'assassin', '暗殺者'], bandit: ['산적', 'bandit', '山賊'],
  spy: ['첩자', '스파이', 'spy', '密偵'], crimeboss: ['범죄조직두목', '범죄 조직 두목', 'crime boss', 'crimeboss', '裏社会の頭領'],
  warrior: ['전사', '검투사', 'fighter', '戦士'], knight: ['기사', '기사단원', '騎士'],
  spearfighter: ['창병', '창술사', '창전사', 'spear fighter', 'spearman', '槍兵', '槍使い'],
  archer: ['궁수', '활잡이', 'bowman', '弓兵', '弓使い'], scout: ['정찰병', '정찰자', '척후병', '斥候', '偵察兵'],
  pugilist: ['격투가', '권투가', '권사', '무투가', 'martial artist', '拳闘士', '格闘家', '武闘家'],
  spellblade: ['마검사', '마법검사', '마법전사', 'magic swordsman', 'spell blade', '魔法剣士', '魔剣士'],
  shieldbearer: ['방패병', '방패전사', '수호전사', 'shield bearer', '盾兵', '盾使い'],
  summoner: ['소환술사', '소환사', '召喚士', '召喚術師'], carpenter: ['목수', '목공', '木工師', '大工'],
  tailor: ['재봉사', '재단사', '仕立て屋', '裁縫師'], weaver: ['직조공', '직조사', '織工', '織物職人'],
  leatherworker: ['가죽세공사', '가죽장인', '피혁장인', 'leather worker', '革細工師', '革職人'],
  gemcutter: ['보석세공사', '보석장인', 'gem cutter', '宝石細工師', '宝石職人'],
  herbalist: ['약초사', '약초꾼', '약초채집가', '약초학자', '薬草師', '薬草採集人'],
  farmer: ['농부', '농사꾼', '農夫', '農民'], fisher: ['어부', '낚시꾼', 'fisherman', '漁師', '釣り師'],
  baker: ['제빵사', '빵장인', '빵 굽는 사람', 'パン職人', 'パン屋'], potter: ['도공', '도예가', '陶工', '陶芸家'],
  shipwright: ['조선공', '선박공', '배목수', 'ship builder', '船大工', '造船工'], scribe: ['서기관', '필경사', '書記官', '写字生'],
};

export function fantasyDialogueJob(text: string): FantasyJob | undefined {
  const query = text.normalize('NFKC').toLowerCase();
  return FANTASY_JOBS.flatMap(job => [job.id, job.name, ...Object.values(job.names), ...JOB_ALIASES[job.id] ?? []]
    .filter(alias => contains(query, alias)).map(alias => ({ job, length: alias.replace(/\s/g, '').length })))
    .sort((a, b) => b.length - a.length)[0]?.job;
}

function professionReply(character: FantasyCharacter, selected: FantasyJob): FantasyGmSourceReply {
  const already = fantasyHasJob(character, selected.id);
  const learnable = canAcquireJob(character, selected.id, 'gm');
  return reply(already ? `すでに${selected.name}です。改めて学ぶ必要はありません。`
    : selected.category === 'none' ? '新しいキャラクターは無職で始まります。学びたい職業を教えてください。'
      : `${selected.name}：${selected.description.split('。')[0]}。${!learnable && selected.id === 'priest' ? 'その土地の神を祀る神殿で師に相談してください。司祭の修練には現在地の神殿が必要です。' : `${selected.name}の修練を始めますか？無料・ゲーム内1時間（実時間${60 / FANTASY_WORLD_TIME_RATE}分）です。`}`,
  learnable ? [{ label: `${selected.name}を学ぶ（無料・実時間${60 / FANTASY_WORLD_TIME_RATE}分）`, action: { type: 'job', job: selected.id, via: 'gm' } }] : [], 'jobs', selected.id);
}

function contains(query: string, value: string) {
  if (/^[a-z0-9-]+$/i.test(value)) {
    const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^a-z0-9-])${escaped}($|[^a-z0-9-])`, 'i').test(query);
  }
  return query.replace(/\s/g, '').includes(value.toLowerCase().replace(/\s/g, ''));
}

function named<T extends { id: string; name: string }>(values: T[], query: string, aliases: Record<string, string[]> = {}) {
  const direct = values.find(value => contains(query, value.id) || contains(query, value.name)
    || Object.values((value as T & { names?: Record<string, string> }).names ?? {}).some(name => contains(query, name))
    || Object.values(FANTASY_TERMS.find(term => term.id === value.id)?.names ?? {}).some(name => contains(query, name)));
  if (direct) return direct;
  const candidates = values.flatMap(value => (aliases[value.id] ?? []).filter(alias => contains(query, alias)).map(alias => ({ value, length: alias.length })));
  return candidates.sort((a, b) => b.length - a.length)[0]?.value;
}

function skillEffect(skill: FantasySkill) {
  if(skill.utility)return `${skill.descriptions?.ja??skill.description}（戦闘強度${Math.max(1,Math.min(12,skill.power))}）`;
  if(skill.restore==='mp')return `MPを${skill.power}回復（最大MPまで）、再使用まで世界時間6時間`;
  if (skill.id === 'cook-sense') return '食品を見て匂いを調べ、鮮度と経過時間・保存期間を判断できる';
  const next = skill.kind === 'active' ? '次の対応する行動で' : '';
  switch (skill.effect) {
    case 'check': return `${next}${skill.stat ? FANTASY_STAT_NAMES[skill.stat] : '能力'}判定+${skill.power}`;
    case 'heal': return `HPを${skill.power}回復（最大HPまで）`;
    case 'guard': return `${next}被害を${skill.power}軽減（最低0）`;
    case 'reward': return `${next}仕事・採集などの成果+${skill.power}`;
    case 'travel': return `${next}旅の所要時間を${skill.power}時間短縮（最低1時間）`;
  }
}

function questReply(profile: FantasyProfile, query: string): FantasyGmSourceReply {
  const character = profile.character!;
  const requested = named(FANTASY_QUESTS, query);
  const respond = (text: string, suggestions: Suggestion[] = []) => reply(text, suggestions, 'quests', requested?.id);
  const board = () => reply('通常の依頼は現地ギルドの期限付き掲示板で受けます。依頼人は実在の住民で、通常依頼は先着一人、大規模討伐だけ共同参加できます。掲載期限と納品期限を確かめてください。', [tab('ギルドの掲示板', 'buildings')], 'quests', 'board');
  if (requested && !character.quests.includes(requested.id) && !character.completed.includes(requested.id) && !fantasyPersonalQuest(requested)) return board();
  const recorded = (quest: FantasyQuest) => fantasyQuestRecordEligible(character, quest) && (character.quests.includes(quest.id) || character.completed.includes(quest.id));
  if (requested && !fantasyQuestEligible(character, requested) && !recorded(requested)) return respond('その依頼の参加条件を満たしていません。現在地で受けられる依頼を確認してください。', [tab('現在地の依頼', 'quests')]);
  if (requested && !character.quests.includes(requested.id) && !character.completed.includes(requested.id)
    && requested.giver !== character.location) return respond('その依頼はまだ受注していません。現在地の依頼を調べてください。', [tab('現在地の依頼', 'quests')]);
  const quests = requested ? [requested] : FANTASY_QUESTS.filter(quest => recorded(quest) && character.quests.includes(quest.id)
    || fantasyPersonalQuest(quest) && fantasyQuestEligible(character, quest) && quest.giver === character.location && !character.completed.includes(quest.id));
  if (!quests.length) return board();
  const suggestions: Suggestion[] = [];
  const describe = (quest: FantasyQuest) => {
    const reportAt = quest.reportAt ?? quest.giver;
    const held = character.inventory[quest.item] ?? 0;
    const details = `「${quest.name}」：${knownName(character, quest.destination)}を訪れ、${itemName(quest.item)}${quest.count}個を${knownName(character, reportAt)}へ納品。所持${held}個。基本報酬は金貨${quest.gold}枚・経験値${quest.xp}（未受領）。`;
    if (quest.id === 'main-night-18' && character.completed.includes(quest.id) && !character.voyageEnding) {
      if (fantasyCanRecordVoyage(character)) suggestions.push({ label: '航海日誌を完成', action: { type: 'finishVoyage' } });
      else suggestions.push(go(FANTASY_FINAL_ISLE_ID, character));
      return fantasyVoyageGuidance(character, 'ja');
    }
    if (character.completed.includes(quest.id)) return `「${quest.name}」は達成済みです。再受注や二重受領はできません。`;
    if (!fantasyQuestEligible(character, quest)) return `${details} 受注の記録は残っていますが、納品には指定の職業へ戻る必要があります。`;
    const contract = character.contracts?.[quest.id];
    if (contract && contract.expiresAt <= character.hour) return `「${quest.name}」は納品期限を過ぎています。受注一覧で破棄を選べます。`;
    const task = fantasyTaskObjective(quest);
    if (task) {
      const ready = fantasyTaskReady(character, quest) && character.location === reportAt;
      if (ready) suggestions.push({ label: `「${quest.name}」を報告`, action: { type: 'complete', quest: quest.id } });
      return `「${quest.name}」：${fantasyTaskObjectiveLabel(quest, 'ja')}。${fantasyTaskProgress(character, quest)}/${task.count}。${knownName(character, quest.destination)}で受注後の有効な行動を記録し、${knownName(character, reportAt)}へ報告してください。成果物は手元に残ります。`;
    }
    if (quest.objective?.type === 'hunt') {
      const progress = contract?.progress ?? 0;
      const ready = progress >= quest.objective.count && character.location === reportAt;
      if (ready) suggestions.push({ label: `「${quest.name}」の討伐を報告`, action: { type: 'complete', quest: quest.id } });
      return `「${quest.name}」：討伐${progress}/${quest.objective.count}。${ready ? '報告の条件がそろいました。' : character.location !== reportAt ? `報告は${knownName(character, reportAt)}で行います。` : '指定された相手の討伐が必要です。'}${contract ? `納品期限は世界時刻${contract.expiresAt}時間。` : ''}`;
    }
    if (!character.quests.includes(quest.id)) {
      if (quest.giver === character.location) {
        suggestions.push({ label: `「${quest.name}」を受注`, action: { type: 'accept', quest: quest.id } });
        return `${details} 現在は未受注です。`;
      }
      suggestions.push(go(reportAt, character));
      return `${details} 未受注のため、まず依頼人の拠点へ移動して受注してください。`;
    }
    const missing: string[] = [];
    if (quest.chapter && !fantasyMainReady(character, quest.id)) {
      const stage = fantasyMainStage(character, quest.id);
      if (stage?.location === character.location) for (const approach of FANTASY_MAIN_APPROACHES) suggestions.push({ label: fantasyMainApproachLabel(stage.kind, approach, 'ja'), action: { type: 'investigate', quest: quest.id, approach } });
      suggestions.push(tab('調査の進行を確認', 'quests'));
      return `${details} ${fantasyMainGuidance(character, quest.id, 'ja')}`;
    }
    if (held < quest.count) missing.push(`${itemName(quest.item)}が${quest.count - held}個不足`);
    if (!character.visited.includes(quest.destination)) missing.push('指定地域が未訪問');
    if (character.location !== reportAt) missing.push('依頼人の拠点へ戻る必要あり');
    if (missing.length) {
      const destination = FANTASY_LOCATIONS.find(place => place.id === quest.destination)!;
      let acquisition = '';
      if (held < quest.count) {
        if (!fantasyKnownLocations(character).includes(destination.id)) {
          acquisition = '指定地域の資源はまだわかりません。隣接地域を調べるか、地図を手に入れてください。';
          suggestions.push(go(quest.destination, character));
        } else if (destination.resources.includes(quest.item)) {
          acquisition = `${destination.name}の探索で採集できます。`;
          suggestions.push(go(quest.destination, character));
        } else {
          const recipes = FANTASY_RECIPES.filter(recipe => recipe.output === quest.item);
          acquisition = `${itemName(quest.item)}は指定地域の探索では自動入手できません。市場で購入できます。${recipes.length ? `制作する場合は${recipes.map(recipe => `${jobName(recipe.job)}の「${recipe.name}」`).join('・')}を、対応する職業・工房・材料で用意してください。` : '採集候補にこの品物がある別の地域で探索する方法もあります。'}`;
          suggestions.push(tab('持ち物・市場・制作を確認', 'inventory'));
          if (recipes.length) suggestions.push(tab('制作職業を確認', 'jobs'));
          const market = FANTASY_LOCATIONS.find(place => place.id === character.location && canBuyItem({ location: place.id }, quest.item))
            ?? FANTASY_LOCATIONS.find(place => fantasyKnownLocations(character).includes(place.id) && canBuyItem({ location: place.id }, quest.item));
          if (market && market.id !== character.location) suggestions.push(go(market.id, character));
          else if (market) {
            const item = FANTASY_ITEMS.find(value => value.id === quest.item)!;
            if (character.gold >= item.price) suggestions.push({ label: `${item.name}を1個購入（金貨${item.price}枚）`, action: { type: 'buy', item: item.id } });
            else {
              acquisition += `購入資金が足りないため、無料の仕事で旅費と代金を用意できます。`;
              suggestions.push({ label: '無料の仕事で資金を用意', action: { type: 'work' } });
            }
          }
        }
      }
      if (!character.visited.includes(quest.destination) && !suggestions.some(s => s.location === quest.destination)) suggestions.push(go(quest.destination, character));
      if (held >= quest.count && character.visited.includes(quest.destination) && character.location !== reportAt) suggestions.push(go(reportAt, character));
      return `${details} 達成条件：${missing.join('、')}。${acquisition}`;
    }
    suggestions.push({ label: `「${quest.name}」を納品して達成`, action: { type: 'complete', quest: quest.id } });
    return `${details} 訪問・必要品・納品場所の条件がそろっています。納品の意思を伝え、確認に答えると達成が確定します。`;
  };
  return respond(quests.map(describe).join('\n'), [...suggestions, tab('依頼一覧', 'quests')]);
}

function fantasyGmReplyJapanese(profile: FantasyProfile, text: string): FantasyGmSourceReply {
  let query = String(text ?? '').slice(0, 500).normalize('NFKC').slice(0, 500).trim().toLowerCase();
  if (!fantasyDialogueJob(query) && /(?:마법|마술).*(?:배우|배울|배워|가르|수련|익히)|(?:learn|study|teach|train).*(?:magic|sorcery)|(?:magic|sorcery).*(?:learn|training)|魔法.*(?:学|教|習|身に|覚|なりたい)|(?:学|教|習).*魔法/.test(query)) query = 'mage';
  const character = profile.character;
  if (!character) {
    const candidate = FANTASY_RACES.find(race => race.id === profile.draft.candidate);
    const kept = FANTASY_RACES.find(race => race.id === profile.draft.kept);
    const suggestions: Suggestion[] = candidate
      ? [{ label: `${candidate.name}をキープ`, action: { type: 'keep' } }, { label: '今回の候補を見送る', action: { type: 'skip' } }]
      : profile.draft.remaining > 0 ? [{ label: `種族を抽選（残り${profile.draft.remaining}回）`, action: { type: 'draw' } }] : [];
    return reply(`まずキャラクターを作成しましょう。人間は抽選なしで選べ、性別を設定できます。職業は無職から始まり、作成後にギルド・NPC・案内人との会話で学べます。種族の抽選は残り${profile.draft.remaining}回。${candidate ? `現在の候補は${candidate.name}。候補のまま作成することも、キープ・見送りもできます。` : ''}${kept ? `キープ中は${kept.name}です。` : ''}作成ボタンを押すまでは、キャラクターは確定しません。`, suggestions, 'draft');
  }
  const location = FANTASY_LOCATIONS.find(place => place.id === character.location);
  const job = FANTASY_JOBS.find(value => value.id === character.job);
  if (!location || !job) return reply('現在の冒険記録に対応する場所・職業を確認できません。再接続して最新の記録を取得してください。', [], 'invalid');
  const lifeJob = FANTASY_JOBS.find(value => value.id === fantasyLifeJob(character));
  const careerNames = lifeJob && lifeJob.id !== job.id ? `${job.name}・生活職 ${lifeJob.name}` : job.name;
  if (profile.activity && /행동|진행|뭐\s*(?:하고|하는|해)|무슨\s*일|하고\s*있|얼마나|남았|남은|何.*(?:して|やって|行動)|行動中|進行中|あと|残り|doing|activity|remaining|how long|busy/.test(query)) {
    const remaining = Math.max(0, profile.activity.endsAt - character.hour);
    const activity = fantasyGmActivityName(profile, 'ja');
    return reply(`いまは${activity}の最中です。現在の職業は${careerNames}。完了までゲーム内で約${remaining.toFixed(2)}時間、現実では約${(remaining * 60 / FANTASY_WORLD_TIME_RATE).toFixed(1)}分です。完了後に結果が記録されます。`, [tab('冒険日誌', 'journal')], 'activity');
  }
  if (!profile.event && !profile.activity && /호위|escort|護衛/.test(query)) {
    const escort = fantasyEscortGuidance(character, 'ja');
    return reply(escort.text, escort.suggestions, 'quests', 'escort');
  }
  const event = FANTASY_EVENTS.find(value => value.id === profile.event);
  if (!profile.event && !profile.activity && /새벽너머|안개.*섬|항해.*결말|beyond.?dawn|voyage.*ending|暁の向こう|航海.*結末/.test(query)
    && !(fantasyKnownLocations(character).includes(FANTASY_FINAL_ISLE_ID) && named(FANTASY_LOCATIONS, query)?.id === FANTASY_FINAL_ISLE_ID)) {
    const choices: Suggestion[] = fantasyCanRecordVoyage(character) ? [{ label: '航海日誌を完成', action: { type: 'finishVoyage' } }] : [tab('航海の記録', character.voyageEnding ? 'journal' : 'quests')];
    return reply(fantasyVoyageGuidance(character, 'ja'), choices, 'quests', 'voyage');
  }
  if (profile.event && !profile.activity) {
    if (!event || !fantasyEventEligible(character, event)) return reply('発生中のイベントを確認できません。最新の冒険記録を取得してください。', [tab('冒険日誌', 'journal')], 'invalid');
    const hours = fantasyHostileEncounter(event.id) ? .5 : 2;
    const stat = (choice: FantasyEventChoice) => fantasyEncounterChoiceStat(event.id, choice.id, fantasyCombatStat(character)) ?? choice.stat;
    return reply(`いまは「${event.name}」の最中です。${event.description}\n${event.choices.map(choice => `${choice.label}：${FANTASY_STAT_NAMES[stat(choice)]}判定 DC${choice.dc}${bodyCheck(character, choice)}`).join('\n')}\n選択はまだ実行していません。希望する選択を言葉で伝え、確認に答えるとゲーム内${hours}時間の行動を始めます。`,
      [...event.choices.map(choice => ({ label: `${choice.label}（${FANTASY_STAT_NAMES[stat(choice)]} DC${choice.dc}${bodyCheck(character, choice)}）`, action: { type: 'event' as const, choice: choice.id } })), tab('判定に役立つスキル', 'skills')], 'event', event.id);
  }
  if (/죽으면|사망|죽었|새로운\s*삶|new life|\bdeath\b|\bdead\b|死ん|死亡|新しい人生/.test(query)) return reply(profile.death ? 'この人生は終わりました。過去の人生の記録を確認し、新しい人物として出発できます。所持品や熟練をそのまま持ち越す操作ではありません。' : '危険な場所でHPを失うと、現在地や仲間によっては救助されず死亡します。記録を残して新しい人物で始める仕組みです。安全な町と野外の危険を同じと考えないでください。', [tab('人生の記録', 'journal')], 'mortality');
  const intendedJob = fantasyDialogueJob(query);
  if (intendedJob && !/의뢰|퀘스트|quest|依頼|クエスト|완료|completed|達成/.test(query)
    && /배우|배워|배울|가르|되고|되려|전직|취득|수련|learn|teach|train|become|なりたい|教え|学び|学ぶ|転職/.test(query)) return professionReply(character, intendedJob);
  if (/마나|기맥|감응|mana|マナ|気脈|感応/.test(query) && !/(?:부족|足り|不足|not enough|low mana)/.test(query)) {
    const mana = fantasyMana(character);
    const detail=/자세|상세|원리|작동|어떻게|detail|explain|mechanic|how.*(?:work|mana)|仕組|詳|原理/.test(query);
    return {...reply(`マナ段階${mana.stage}/4・制御${mana.mastery}・負荷${mana.strain}/100。${detail ? FANTASY_MANA_PRINCIPLES.map(principle => `${principle.names.ja}：${principle.description.ja}`).join(' ') : FANTASY_MANA_PRINCIPLES.map(principle=>principle.names.ja).join(' → ')} マナは職業を問わず、実際に役立ったMP使用で育ちます。判定や防護の準備は消費されてから、回復は実際に回復した時に経験になります。同じ行動の反復は成長が減衰し、失敗も少量の経験になります。専用の強化修練を始める必要はありません。`, [tab('使える技能', 'skills')], 'mana'),detail};
  }
  if (/部隊|組織|召喚契約|魔法合成|錬金調合|부대|조직\s*관리|소환\s*계약|마법\s*합성|연금\s*조합|company|organization|summon.*contract|spell.*compos|alchemy.*mix/.test(query)) return reply(fantasySpecializationSummary(character, 'ja'), [tab('職業の管理メニュー', 'jobs')], 'specialization');
  if (/채광|벌목|약초.*채집|사냥|낚시|어선|광맥|gathering|mining|logging|hunting|fishing|fishing boat|採掘|伐採|狩猟|釣り|漁船/.test(query)) return reply('採掘・薬草採集・伐採・狩猟・釣りは現地の資源と道具を確かめて選びます。釣りでは釣り道具や船の条件も確認してください。品質は材料と熟練が中心で、同じ行動の反復は成長が減衰します。地図にない地域の資源はまだわかりません。', [tab('現在地の採集メニュー', 'location'), tab('道具と持ち物', 'inventory')], 'gathering');
  if (/図書|設定集|世界観|ルール|全スキル|全職業|スキル書|책|도서|세계관|설정집|규칙|전체\s*스킬|전체\s*직업|library|world bible|rulebook/.test(query)) {
    const library = FANTASY_LOCATIONS.find(place => fantasyKnownLocations(character).includes(place.id) && hasBuilding({ ...character, location: place.id }, 'library'));
    return reply(hasBuilding(character, 'library') ? '現在地の図書館で、所蔵されている本を読めます。' : '詳しい知識は図書館の本で調べられます。',
      [library?.id === character.location ? tab('図書館へ', 'buildings') : library ? go(library.id, character) : tab('現在地を調べる', 'location')], 'library');
  }
  if (/失敗|判定|なぜ|どうして|왜|실패|판정|주사위|로그|日誌|履歴|history|dice|fail|\bwhy\b/.test(query)) {
    const failure = /失敗|なぜ|どうして|왜|실패|fail|\bwhy\b/.test(query);
    const records = profile.log.filter(entry => failure ? entry.kind === 'failure' : /d20=/.test(entry.text));
    const last = records.slice(-3);
    return reply(last.length ? `冒険日誌に残っている${failure ? '失敗' : '判定'}の記録です。\n${last.map(entry => `時刻${entry.hour}：${entry.text}`).join('\n')}\n記録にない原因や結果は断定できません。判定はd20と能力・習熟・スキルの補正で行います。`
      : `まだ${failure ? '失敗' : '判定'}の記録がありません。成功や失敗は実際の行動後、冒険日誌に記録されます。`, [tab('冒険日誌を開く', 'journal'), tab('スキルを確認', 'skills')], 'log', failure ? 'failure' : 'roll');
  }
  if (/依頼|クエスト|受注|納品|達成|퀘스트|의뢰|수주|납품|완료|quest/.test(query) || named(FANTASY_QUESTS, query)) return questReply(profile, query);
  if (/ステータス|能力|状態|キャラ|種族|性別|스텟|스탯|능력치|캐릭터|종족|성별|status|stats|character|\bhp\b|\bmp\b/.test(query)
    && !/スキル|스킬|skill|회복|回復|(?:mp|마나).*(?:足り|不足|부족)/.test(query)) {
    const stats = fantasyStats(character);
    const race = FANTASY_RACES.find(value => value.id === character.race);
    const gender = character.gender === 'female' ? '女性' : character.gender === 'male' ? '男性' : '性別なし';
    return reply(`${character.name}／${race?.name ?? character.race}・${gender}／${careerNames} Lv.${character.level}\nHP ${character.hp}/${stats.hp}・MP ${character.mp}/${stats.mp}・金貨${character.gold}枚\n疲労${character.fatigue}・空腹${character.hunger}\n${Object.entries(stats).filter(([stat]) => stat !== 'hp' && stat !== 'mp').map(([stat, value]) => `${FANTASY_STAT_NAMES[stat as FantasyStat]}${value}`).join('・')}\n${job.extra ? `${FANTASY_STAT_NAMES[job.extra]}は現在の職業で使う追加能力です。` : '職業によっては手先やカリスマが追加されます。'}`, [tab('スキルを見る', 'skills'), tab('職業を見る', 'jobs')], 'status');
  }
  if (/スキル|技能|パッシブ|アクティブ|魔法|스킬|패시브|액티브|skill|passive|active|(?:mp|마나).*(?:足り|不足|부족)/.test(query)) {
    const skills = fantasySkills(character);
    const stats = fantasyStats(character);
    const usable = skills.filter(skill => skill.kind === 'active' && character.mp >= skill.mp
      && (skill.restore==='mp'?character.mp<stats.mp&&(character.manaRecoveryAt===undefined||character.hour-character.manaRecoveryAt>=6):skill.utility?!fantasyWorldUtilityError(character,skill):skill.effect === 'heal' ? character.hp < stats.hp : !character.buff));
    const rest = recovery(character);
    return reply(`現在のMPは${character.mp}/${stats.mp}。\n${skills.map(skill => `${skill.name}【${skill.kind === 'passive' ? 'パッシブ・常時' : `アクティブ・MP${skill.mp}`}】：${skill.description} 実効：${skillEffect(skill)}。${skill.kind === 'active' && character.mp < skill.mp ? '（MP不足）' : ''}`).join('\n')}\n${character.buff ? '一時強化が有効です。次の対応する行動で使うか、休息して解除できます。' : 'アクティブスキルは名前を伝えて確認するとMPを消費します。'}${rest.text}`,
      [...usable.map(skill => ({ label: `${skill.name}を使う（MP${skill.mp}）`, action: { type: 'skill' as const, skill: skill.id } })), ...rest.suggestions, tab('自分のスキル', 'skills')], 'skills');
  }
  if (/食事|空腹|食堂|배고|허기|식사|식당|hunger|hungry|dining|\bmeal\b|\beat\b|\bfood\b/.test(query)
    && !/상했|썩|신선|fresh|rotten|spoil|鮮度|腐|傷/.test(query)) {
    const dining = hasBuilding(character, 'inn') || hasBuilding(character, 'restaurant');
    return reply(`現在の空腹は${character.hunger}です。${dining ? FANTASY_DINING.map(meal => `${meal.name.ja}：金貨${meal.cost}枚・${meal.hours}時間、空腹-${meal.nutrition}`).join('。') : '現在地には食事を頼める宿屋・食堂がありません。持っている食べ物を確認してください。'}`,
      [...(dining ? FANTASY_DINING.filter(meal => character.gold >= meal.cost).map(meal => ({ label: `${meal.name.ja}を注文（金貨${meal.cost}枚・${meal.hours}時間）`, action: { type: 'eat' as const, meal: meal.id } })) : []), tab('持ち物の食べ物', 'inventory')], 'dining');
  }
  if (/制作|製作|作成|調合|レシピ|材料|料理を|鍛える|제작|제조|조합|레시피|재료|만들|craft|recipe/.test(query)) {
    const recipes = FANTASY_RECIPES.filter(recipe => fantasyHasJob(character, recipe.job));
    if (!recipes.length) return reply(`${job.name}には現在、制作レシピがありません。料理人・鍛冶師・錬金術師などの職業には専用の製法があります。転職はギルドで行えます。`, [tab('職業と製法を確認', 'jobs'), tab('持ち物', 'inventory')], 'craft');
    const suggestions: Suggestion[] = [];
    const facility = fantasyCraftFacility(lifeJob?.id ?? character.job);
    const facilityName = facility ? ({ guild: 'ギルド', blacksmith: '鍛冶屋', alchemist: '錬金工房', tower: '魔術師の塔', restaurant: '食堂', market: '市場', library: '図書館', temple: '神殿', shipyard: '造船所' } as Record<string, string>)[facility] ?? '共同設備' : '共同設備';
    const descriptions = recipes.map(recipe => {
      const missing = Object.entries(recipe.inputs).filter(([id, amount]) => (character.inventory[id] ?? 0) < amount);
      const materials = Object.entries(recipe.inputs).map(([id, amount]) => `${itemName(id)}${amount}個（所持${character.inventory[id] ?? 0}）`).join('・');
      const ready = fantasyCanCraft(character, recipe) && !missing.length;
      if (ready) suggestions.push({ label: `${recipe.name}を制作（3時間・DC${recipe.dc}）`, action: { type: 'craft', recipe: recipe.id } });
      return `${recipe.name}：${materials} → ${itemName(recipe.output)}${recipe.count}個。${FANTASY_STAT_NAMES[FANTASY_JOBS.find(value => value.id === recipe.job)!.stat]}判定 DC${recipe.dc}・3時間。${!facility || !hasBuilding(character, facility) ? `現在地には${facilityName}がありません。` : missing.length ? `不足：${missing.map(([id, amount]) => `${itemName(id)}${amount - (character.inventory[id] ?? 0)}個`).join('・')}。` : ready ? '制作できます。' : '写図に必要な地理情報をまだ知りません。'}結果は実行後に判定します。`;
    });
    return reply(descriptions.join('\n'), [...suggestions, tab('持ち物と制作', 'inventory')], 'craft');
  }
  const destination = named(FANTASY_LOCATIONS, query, PLACE_ALIASES);
  if (destination) {
    const known = fantasyKnownLocations(character).includes(destination.id);
    const frontier = fantasyFrontierLocations(character).includes(destination.id);
    if (!known && !frontier) return reply('その地域はまだ地図に載っていません。訪問するか、地図を手に入れて使用すると調べられます。', [tab('持ち物と地図', 'inventory')], 'travel', destination.id);
    if (destination.id === character.location) return reply(`そこは現在地の${destination.name}です。\n採集候補：${destination.resources.map(itemName).join('・')}。`, [{ label: '現在地を探索（3時間）', action: { type: 'explore' } }, tab('現在地', 'location')], 'travel', destination.id);
    const transports = fantasyTransports(character, destination.id);
    const available = transports.filter(transport => transport.available);
    const free = available.filter(transport => transport.cost === 0);
    return reply(`${known ? `${destination.name}（危険度${destination.danger}）へ移動しますか？` : '隣接する未踏の地域へ移動しますか？名前や資源はまだわかりません'}\n${transports.map(transport => `${transport.name}：${transport.path.length ? `金貨${transport.cost}枚・${transport.hours}時間` : '経路なし'}${transport.available ? '・利用可能' : `・利用不可（${transport.reason}）`}`).join('\n')}\n${free.length ? `無料の移動手段：${free.map(transport => transport.name).join('・')}。` : '旅費が足りなければ現在地で無料の仕事をして資金を得られます。港同士では無料の手伝い船も確認してください。'}まだ移動していません。交通手段を選び、確認してから開始します。`,
      [go(destination.id, character), ...available.map(transport => ({ label: `${transport.name}で移動（金貨${transport.cost}枚・${transport.hours}時間）`, action: { type: 'travel' as const, destination: destination.id, transport: transport.id } }))], 'travel', destination.id);
  }
  const selectedJob = fantasyDialogueJob(query);
  if (selectedJob || /職業|転職|仕事|働|金策|稼|お金|旅費|金貨|직업|전직|일하|일할|돈|금화|생활|job|work|money|profession|career|earn/.test(query)) {
    const workWanted = /仕事|働|金策|稼|お金|旅費|金貨|일하|일할|돈|금화|work|money|earn/.test(query);
    if (selectedJob && !(fantasyHasJob(character, selectedJob.id) && workWanted)) {
      return professionReply(character, selectedJob);
    }
    const workJob = selectedJob && selectedJob.id === lifeJob?.id ? lifeJob : job;
    const workAction: FantasyAction = workJob.id !== character.job ? { type: 'work', career: 'life' } : { type: 'work' };
    return reply(`現在の職業は${careerNames}です。仕事は無料・ゲーム内4時間（実時間${240 / FANTASY_WORLD_TIME_RATE}分）で、完了後に判定結果と賃金が記録されます。`,
      [...(workWanted ? [{ label: `${workJob.name}として働く（無料・実時間${240 / FANTASY_WORLD_TIME_RATE}分）`, action: workAction }] : []), tab('職業一覧', 'jobs')], 'jobs');
  }
  if (/採集|資源|探索|探検|採取|채집|자원|탐사|탐험|수집|explore|gather|resource/.test(query)) {
    return reply(`${location.name}の採集候補は${location.resources.map(itemName).join('・')}。探索には3時間かかり、危険度は${location.danger}です。発見と危険の判定は実行後に決まり、結果は冒険日誌に残ります。`, [{ label: '現在地を探索（3時間）', action: { type: 'explore' } }, tab('現在地の詳細', 'location')], 'explore');
  }
  if (/持ち物|所持品|在庫|バッグ|인벤|소지품|가방|보유|재고|inventory|bag/.test(query)) {
    const inventory = Object.entries(character.inventory).filter(([, amount]) => amount > 0);
    return reply(`金貨${character.gold}枚。持ち物：${inventory.length ? inventory.map(([id, amount]) => `${itemName(id)}${amount}個`).join('・') : 'なし'}。\n${fantasyBuildings(character).some(building => ['market', 'alchemist', 'blacksmith', 'inn', 'restaurant', 'shipyard'].includes(building.id)) ? '現在地の店ごとに購入・売却できる品が違います。' : '購入・売却には対応する店のある拠点へ移動してください。'}制作には対応する職業・設備・材料が必要です。`, [tab('持ち物と制作', 'inventory')], 'inventory');
  }
  if (/休|回復|宿|쉬|휴식|회복|여관|rest|heal|sleep|recover/.test(query)) {
    const rest = recovery(character);
    return reply(`${rest.text}時間はゲーム内で進みます。`, [...rest.suggestions, tab('回復用の持ち物', 'inventory')], 'recovery');
  }
  if (/現在地|どこ|ここ|場所|어디|현재\s*위치|현\s*위치|여기|where|location/.test(query)) {
    return reply(`現在地は${location.name}、${location.region}です。\nゲーム内時刻は${character.hour}時間、危険度${location.danger}。行き先を地図で選ぶと現在使える移動手段・費用・時間を確認できます。`, [tab('現在地と移動先', 'location'), tab('依頼を見る', 'quests')], 'location');
  }
  if (!query || /こんにちは|こんばんは|おはよう|はじめ|助け|ヘルプ|遊び方|^(?:何が|何を)できる|안녕|반가|도움|가이드|^뭐할|^(?:뭘|무엇을?)\s*할\s*수|hello|help|\bhi\b/.test(query)) {
    return reply(`現在地：${location.name}。移動・職業・依頼・技術・制作・判定を案内します。確認済みの記録に基づいて回答します。行動は内容の確認と承認後に開始します。`, help(), 'help');
  }
  return reply('その質問には、現在のルール会話ではまだ答えられません。「現在地」「仕事」「依頼」「スキル」「制作」「なぜ失敗した？」、または地名を尋ねてください。記録にない出来事や報酬を作って確定することはできません。', help());
}

export function fantasyGmReply(profile: FantasyProfile, text: string, locale: NpcLocale = 'ja'): FantasyGmReply {
  if (fantasyPrivateCareerQuestion(text)) return { text: fantasyPrivateCareerReply(locale), suggestions: [] };
  const growth = !profile.death && fantasyGmGrowthQuestion(text) ? fantasyGmGrowthReply(profile, locale) : undefined;
  if (growth) return growth;
  if (profile.combatId) return { text: { ko: '지금은 전투 중이야. 전투 화면에서 공격·방어·기술·소모품·퇴각을 선택해 줘. 아직 승패는 정해지지 않았어.', en: 'Combat is in progress. Choose attacks, defense, skills, consumables or retreat on the battlefield. The outcome is not settled yet.', ja: '現在は戦闘中です。戦闘画面で攻撃・防御・技能・消耗品・離脱を選んでください。勝敗はまだ決まっていません。' }[locale], suggestions: [] };
  const clue = profile.character && (fantasyVoyageChoiceReply(profile.character, text, locale) ?? fantasyVoyageClueReply(profile.character, text, locale));
  if (clue) return { text: clue, suggestions: [{ label: { ko: '항해 기록', en: 'Voyage journal', ja: '航海の記録' }[locale], tab: 'journal' }] };
  const result = fantasyGmReplyJapanese(profile, text);
  const output = locale === 'ja' ? { text: result.text, suggestions: result.suggestions } : fantasyGmLocalized(profile, result, locale);
  return profile.activity || profile.death ? { ...output, suggestions: output.suggestions.filter(suggestion => !suggestion.action) } : output;
}

export function fantasyGmCanAnswer(profile: FantasyProfile, text: string): boolean {
  if (fantasyPrivateCareerQuestion(text)) return true;
  if (profile.character && !profile.death && fantasyGmGrowthQuestion(text)) return true;
  if (profile.combatId) return true;
  if (profile.character && (fantasyVoyageChoiceReply(profile.character, text, 'ja') ?? fantasyVoyageClueReply(profile.character, text, 'ja'))) return true;
  return fantasyGmReplyJapanese(profile, text).topic !== 'unknown';
}
