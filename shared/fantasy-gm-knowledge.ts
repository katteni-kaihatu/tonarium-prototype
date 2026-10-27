import type { FantasyProfile } from './fantasy.ts';
import { FANTASY_WORLD_TIME_RATE } from './fantasy.ts';
import { FANTASY_EVENTS, FANTASY_ITEMS, FANTASY_JOBS, FANTASY_LOCATIONS, FANTASY_QUESTS, FANTASY_RACES } from './fantasy-data.ts';
import { fantasyEventEligible, fantasyQuestEligible } from './fantasy-access.ts';
import { fantasySkills, fantasyStats } from './fantasy-engine.ts';
import { foodMeta, foodSense, FANTASY_DINING, FANTASY_LODGINGS } from './fantasy-life.ts';
import { FANTASY_CANON_FACTS, FANTASY_TERMS } from './fantasy-lore.ts';
import { fantasyEventText, fantasyQuestText } from './fantasy-narrative.ts';
import { fantasyBodyTraits, fantasyContextBonus, FANTASY_CONTEXT_NAMES } from './fantasy-physiology.ts';
import { fantasySkillName } from './fantasy-skill-names.ts';
import { fantasyBuildings, fantasyKnownLocations, FANTASY_MAPS } from './fantasy-town.ts';
import { NPC_PUBLIC, type NpcLocale } from './npc.ts';
import { FANTASY_MANA_EXERCISES, fantasyMana } from './fantasy-mana.ts';
import { FANTASY_PROPERTY_PLOTS } from './fantasy-property.ts';
import { FANTASY_PRIEST_BRANCHES, fantasyPriestGrowthStatus } from './fantasy-priest-growth.ts';
import { FANTASY_JOB_PATHS } from './fantasy-job-paths.ts';
import { fantasyJobPathDiscovered } from './fantasy-job-discovery.ts';
import { fantasyActiveEffects } from './fantasy-effects.ts';
import { FANTASY_MAIN_REVEALS } from './fantasy-second-content.ts';
import { fantasyEnvironment } from './fantasy-environment.ts';
import { fantasySpecializationSummary } from './fantasy-specializations.ts';
import { fantasyProfessionGrade } from './fantasy-progression.ts';
import { fantasyEquippedGear } from './fantasy-equipment.ts';
import { fantasyGmActivityName } from './fantasy-gm-locale.ts';
import { FANTASY_JOB_GRADES } from './fantasy-skill-expansion.ts';
import { fantasyPersonalQuest } from './fantasy-contracts.ts';
import { fantasyMainGuidance } from './fantasy-main-guidance.ts';
import { fantasyTaskObjectiveLabel, fantasyTaskProgress } from './fantasy-task-progress.ts';
import { fantasyEncounterChoiceStat } from './fantasy-encounters.ts';
import { fantasyCombatStat } from './fantasy-equipment.ts';
import { fantasyTravelEffectName } from './fantasy-travel-goods.ts';
import { fantasyEscortGuidance } from './fantasy-escort-guidance.ts';
import { fantasyVoyageKnowledge } from './fantasy-voyage-knowledge.ts';
import { fantasyVoyageDecisionMemories } from './fantasy-voyage-decisions.ts';
import { FANTASY_COMBAT_ENEMIES } from './fantasy-combat-catalog.ts';

const escaped = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Only facts this character can currently know. Server-only NPC notes are never imported. */
export function fantasyGmKnowledge(profile: FantasyProfile, locale: NpcLocale): string {
  const say = (ko: string, en: string, ja: string) => ({ ko, en, ja })[locale];
  const known = new Set(profile.character ? fantasyKnownLocations(profile.character) : []);
  const hidden = FANTASY_TERMS.filter(term => term.category === 'place' && !known.has(term.id));
  const hiddenNames = new Set(hidden.flatMap(term => [
    ...Object.values(term.names), ...Object.values(term.aliases ?? {}).flat(),
    FANTASY_LOCATIONS.find(place => place.id === term.id)?.name ?? '',
  ]).filter(Boolean));
  const conceal = (text: string) => [...hiddenNames].sort((a, b) => b.length - a.length).reduce((value, name) =>
    value.replace(new RegExp(escaped(name), 'giu'), say('미지의 장소', 'Unknown place', '未知の場所')), text);
  const termName = (id: string) => FANTASY_TERMS.find(term => term.id === id)?.names[locale];
  const placeName = (id: string) => known.has(id) ? termName(id) ?? say('알려진 지역', 'Known region', '既知の地域') : say('미지의 장소', 'Unknown place', '未知の場所');
  const itemName = (id: string) => {
    const item = FANTASY_ITEMS.find(item => item.id === id);
    return item ? termName(id) ?? item.name : FANTASY_MAPS.find(map => map.item === id)?.name[locale];
  };
  const lines = [say(
    `모든 참가자는 같은 세계 시계를 사용한다. 실제 1분은 게임 ${FANTASY_WORLD_TIME_RATE}분이다. 결과는 서버에서 활동을 완료할 때만 확정된다.`,
    `All players share one world clock. One real minute is ${FANTASY_WORLD_TIME_RATE} game minutes. Activity results are committed by the server at completion.`,
    `全参加者は同じ世界時計を使う。現実の1分はゲーム内${FANTASY_WORLD_TIME_RATE}分。行動結果は完了時にサーバーが確定する。`,
  )];
  const c = profile.character;
  if (!c) {
    lines.push(say(`캐릭터 미생성. 종족 추첨 잔여 ${profile.draft.remaining}/5. 기본 종족은 인간이다.`,
      `No character has been created. Race draws remaining: ${profile.draft.remaining}/5. The default race is Human.`,
      `キャラクターは未作成。種族抽選は残り${profile.draft.remaining}/5。基本種族は人間。`));
    for (const [label, id] of [[say('현재 후보', 'Current draw', '現在の候補'), profile.draft.candidate], [say('킵한 종족', 'Kept race', 'キープ中'), profile.draft.kept]] as const) {
      const race = FANTASY_RACES.find(race => race.id === id);
      if (race) lines.push(`${label}: ${race.names[locale]}`);
    }
    return conceal(lines.join('\n'));
  }
  if (profile.combatId) lines.push(say('현재 전투 중이다. 라운드별 행동은 전투 화면에서 선택하며 결과는 아직 확정되지 않았다. 전투를 끝내거나 퇴각하기 전에는 다른 활동을 시작할 수 없다.', 'Combat is in progress. Round actions are chosen on the battlefield and the outcome is not yet settled. Other activities require finishing combat or retreating.', '現在は戦闘中。ラウンドの行動は戦闘画面で選び、結果は未確定。戦闘を終えるか離脱するまで別の活動を始められない。'));
  const publicLabel = say('기초 공개 설정', 'Public basics', '基本の公開設定');
  for (const term of FANTASY_TERMS.filter(term => ['world-title', 'calendar', 'mana'].includes(term.id))) lines.push(`${publicLabel}: ${term.names[locale]} — ${term.summary[locale]}`);
  const reveals=FANTASY_MAIN_REVEALS.filter(fact=>c.completed.includes(fact.questId)&&(fact.questId!=='main-night-18'||!!c.voyageEnding));
  const superseded=new Set(reveals.flatMap(fact=>fact.supersedes??[]));
  for(const reveal of reveals)lines.push(say('직접 확인한 세계의 단서','World evidence you verified','自分で確かめた世界の手掛かり')+': '+reveal.text[locale]);
  lines.push(...fantasyVoyageKnowledge(c, locale));
  for (const memory of fantasyVoyageDecisionMemories(c, locale)) lines.push(say('여정에서 본인이 한 선택', 'Your own choice on the voyage', '旅で自分がした選択') + ': ' + memory.text);
  for(const honor of c.honors??[]){const title=FANTASY_COMBAT_ENEMIES.find(enemy=>enemy.reward.honor?.id===honor)?.reward.honor;if(title)lines.push(say('직접 얻은 명예 칭호','Honor personally earned','自分で得た名誉称号')+': '+title.names[locale]);}
  for (const fact of FANTASY_CANON_FACTS.filter(fact => ['uncharted-isle-rumor', 'core-attributes', 'life-and-rescue'].includes(fact.id)&&!superseded.has(fact.id))) lines.push(`${publicLabel}: ${fact.text[locale]}`);
  const race = FANTASY_RACES.find(race => race.id === c.race);
  const job = FANTASY_JOBS.find(job => job.id === c.job);
  const stats = fantasyStats(c);
  const chosenPath = FANTASY_JOB_PATHS.find(path => path.id === c.jobPaths?.[c.job]?.path);
  if (chosenPath) lines.push(say('본인이 택한 전문 분야', 'Your chosen specialty', '自分が選んだ専門分野') + ': ' + chosenPath.names[locale] + ' — ' + chosenPath.fields[locale]);
  const discoveredPaths = c.job === 'priest' ? FANTASY_PRIEST_BRANCHES.filter(path=>fantasyJobPathDiscovered(c,`priest-${path.id}`)) : FANTASY_JOB_PATHS.filter(path=>path.job===c.job&&fantasyJobPathDiscovered(c,path.id));
  if (discoveredPaths.length) lines.push(say('직접 읽거나 걸어 보며 알게 된 전문 갈래', 'Specialty paths discovered through your reading or experience', '自分で読んだり歩んだりして知った専門の道') + ': ' + discoveredPaths.map(path=>path.names[locale]).join(', '));
  lines.push(say('세부 전직의 정확한 기준·수치·필수 기술·해금 방법은 말하거나 추측하지 않는다. 본인의 현재 직업·실제 기록·선택한 분야만 설명한다.', 'Never state or guess exact specialty prerequisites, numeric thresholds, required skills or unlocking methods. Discuss only the current profession, actual personal records and chosen field.', '細かい転職の正確な基準・数値・必須技能・解放方法は話さず推測もしない。今の職業・実際の個人記録・選んだ分野だけを説明する。'));
  if (c.propertyTitles?.length) lines.push(say('본인 소유 부동산', 'Your properties', '自分の不動産') + ': ' + c.propertyTitles.map(id => FANTASY_PROPERTY_PLOTS.find(plot => plot.id === id)?.names[locale]).filter(Boolean).join(', '));
  if (c.job === 'priest' && c.priestGrowth) {
    const faith = fantasyPriestGrowthStatus(c), branch = FANTASY_PRIEST_BRANCHES.find(branch => branch.id === faith.branch);
    lines.push(say(`본인의 신앙 기록: 신앙 ${faith.faith}, 봉사 ${faith.service}, 교리 독서 ${faith.doctrine}, 성소 ${faith.pilgrimage}, 이행한 서약 ${faith.vows}, 현재 신전 신뢰 ${faith.templeTrust[c.location] ?? 0}.`, `Your faith record: faith ${faith.faith}, services ${faith.service}, doctrine books ${faith.doctrine}, sanctuaries ${faith.pilgrimage}, fulfilled vows ${faith.vows}, local temple trust ${faith.templeTrust[c.location] ?? 0}.`, `自分の信仰記録: 信仰${faith.faith}、奉仕${faith.service}、教理書${faith.doctrine}、聖所${faith.pilgrimage}、果たした誓い${faith.vows}、現地神殿の信頼${faith.templeTrust[c.location] ?? 0}。`));
    if (branch) lines.push(say('걷고 있는 신앙의 길', 'Your chosen faith path', '歩んでいる信仰の道') + ': ' + branch.names[locale]);
  }
  lines.push(say(
    `현재 인물: ${c.name}; ${race?.names[locale] ?? ''}; ${job?.names[locale] ?? ''}; 레벨 ${c.level}, XP ${c.xp}, 직업 숙련 ${c.jobXp[c.job] ?? 0}; 소지금 ${c.gold} G.`,
    `Current character: ${c.name}; ${race?.names[locale] ?? ''}; ${job?.names[locale] ?? ''}; level ${c.level}, XP ${c.xp}, job proficiency ${c.jobXp[c.job] ?? 0}; gold ${c.gold} G.`,
    `現在の人物: ${c.name}; ${race?.names[locale] ?? ''}; ${job?.names[locale] ?? ''}; レベル${c.level}, XP${c.xp}, 職業熟練${c.jobXp[c.job] ?? 0}; 所持金${c.gold}G。`,
  ));
  lines.push(`${say('현재 위치', 'Current location', '現在地')}: ${placeName(c.location)}; ${say('세계 시각', 'World hour', '世界時刻')}: ${c.hour.toFixed(3)}; HP ${c.hp}/${stats.hp}; MP ${c.mp}/${stats.mp}; ${say('피로', 'fatigue', '疲労')} ${c.fatigue}/100; ${say('허기', 'hunger', '空腹')} ${c.hunger}/100.`);
  if (c.escort) lines.push(fantasyEscortGuidance(c, locale).text);
  const statNames = { strength: say('힘', 'strength', '力'), agility: say('민첩', 'agility', '敏捷'), intelligence: say('지능', 'intelligence', '知力'), luck: say('운', 'luck', '運'), vitality: say('체력', 'vitality', '体力'), dexterity: say('재주', 'dexterity', '手先'), charisma: say('카리스마', 'charisma', 'カリスマ') };
  lines.push(`${say('자기 능력치', 'Own attributes', '自分の能力')}: ${Object.entries(statNames).filter(([key]) => stats[key as keyof typeof stats] !== undefined).map(([key, label]) => `${label} ${stats[key as keyof typeof stats]}`).join(', ')}.`);
  const mana = fantasyMana(c);
  lines.push(say(`자기 마나 수련: 단계 ${mana.stage}/4, 실사용 경험 ${mana.useXp??0}. MP가 실제 판정·회복·방어에 유효하게 쓰이면 자라며, 버튼 연타나 대화만으로 강화되지 않는다. 같은 활동 반복은 성장량이 감소한다. 부담 ${mana.strain}/100은 게임 시간당 6 줄어든다.`,
    `Own mana training: stage ${mana.stage}/4, effective-use experience ${mana.useXp??0}. Mana grows when spent MP has a real effect in checks, healing or defense, with diminishing gains for repeated activities. Talking or repeatedly preparing a skill does not train it. Strain ${mana.strain}/100 recovers by 6 per game hour.`,
    `自分のマナ修練: 段階${mana.stage}/4、有効使用経験${mana.useXp??0}。MPが判定・回復・防御で実際に働くと成長し、同じ行動の反復は成長が減る。会話や準備の連打だけでは鍛えられない。負荷${mana.strain}/100はゲーム内1時間ごとに6回復。`));
  lines.push(say('직업 등급','Profession grade','職業等級')+': '+FANTASY_JOB_GRADES[fantasyProfessionGrade(c)].names[locale]);
  const environment=fantasyEnvironment(c);
  lines.push(say(`현재 환경: ${environment.year}년, ${environment.season}, 계절 ${environment.seasonDay}/15일, ${environment.night?'밤':'낮'}, 날씨 ${environment.weather}, 기온 ${environment.temperature}도. 야외의 어둠은 광원이나 야간 감각이 없으면 활동을 제한한다. 의복은 추위·더위·비의 불이익을 줄인다.`,`Current environment: year ${environment.year}, ${environment.season} day ${environment.seasonDay}/15, ${environment.night?'night':'day'}, ${environment.weather}, ${environment.temperature} degrees. Darkness restricts outdoor activities without light or adapted senses. Clothing reduces cold, heat and rain penalties.`,`現在の環境: ${environment.year}年、${environment.season}の${environment.seasonDay}/15日、${environment.night?'夜':'昼'}、${environment.weather}、${environment.temperature}度。暗所の野外行動は光源か夜目が必要。服は寒暖と雨の不利を軽減する。`));
  lines.push(fantasySpecializationSummary(c,locale));
  if(profile.death)lines.push(say('현재 인물은 사망했다. 새 삶을 시작하기 전에는 게임 행동을 할 수 없다. 이전 삶의 발자취는 세계에 남는다.','This character has died. Gameplay requires beginning a new life. Footprints of past lives remain in the world.','この人物は亡くなった。新しい人生を始めるまでゲーム行動はできず、過去の足跡は世界に残る。'));
  const bonuses = (values: Record<string, number | undefined>) => Object.entries(values).filter(([, value]) => value).map(([stat, value]) => `${stat === 'hp' || stat === 'mp' ? stat.toUpperCase() : statNames[stat as keyof typeof statNames] ?? stat} ${value! > 0 ? '+' : ''}${value}`).join(', ');
  for (const [slot, id] of Object.entries(c.equipment ?? {})) {
    const item = FANTASY_ITEMS.find(item => item.id === id && item.equipment?.slot === slot);
    if (!item || (c.inventory[item.id] ?? 0) <= 0) continue;
    const slots = { weapon: say('무기', 'weapon', '武器'), offhand: say('보조 장비', 'offhand', '副手'), armor: say('방어구', 'armor', '防具'), accessory: say('장신구', 'accessory', '装身具') };
    lines.push(`${say('장착 장비', 'Equipped item', '装備中の品')}: ${itemName(item.id)} (${slots[slot as keyof typeof slots]}); ${bonuses(item.equipment!.stats ?? {})}${item.equipment!.guard ? `; ${say('피해 경감', 'damage reduction', '被害軽減')} +${item.equipment!.guard}` : ''}.`);
  }
  for(const gear of fantasyEquippedGear(c))lines.push(say('장착 개체의 추가 효과','Equipped instance additions','装備個体の追加効果')+': '+itemName(gear.item)+'; '+say('품질','quality','品質')+' '+gear.quality+'; '+bonuses(gear.bonuses??{})+(gear.guard?'; '+say('방호','guard','防護')+' +'+gear.guard:'')+(gear.check?'; '+say('판정','check','判定')+' +'+gear.check:'')+(gear.gem?'; '+itemName(gear.gem):''));
  const effectNames = { poison: say('중독', 'poison', '毒'), burn: say('화상', 'burn', '火傷'), frost: say('동상', 'frost', '凍傷'), weakness: say('쇠약', 'weakness', '衰弱'), 'well-fed': say('식사 강화', 'meal enhancement', '食事強化'), 'gem-focus': say('보석 집중', 'gem focus', '宝石の集中'), 'gem-ward': say('보석 수호', 'gem ward', '宝石の守り'), 'gem-luck': say('보석 행운', 'gem luck', '宝石の幸運') };
  for (const effect of fantasyActiveEffects(c)) lines.push(`${say('현재 지속 효과', 'Current timed effect', '現在の持続効果')}: ${fantasyTravelEffectName(effect.id,locale) ?? effectNames[effect.id as keyof typeof effectNames] ?? effect.id}; ${bonuses(effect.stats ?? {})}${effect.check ? `; ${say('판정', 'check', '判定')} ${effect.check > 0 ? '+' : ''}${effect.check}` : ''}${effect.guard ? `; ${say('피해 경감', 'damage reduction', '被害軽減')} +${effect.guard}` : ''}${effect.periodicHp ? `; HP ${effect.periodicHp}/${say('게임 시간', 'game hour', 'ゲーム時間')}` : ''}; ${say('남은 게임 시간', 'game hours remaining', '残りゲーム時間')} ${(effect.expiresAt - c.hour).toFixed(3)}.`);
  for (const skill of fantasySkills(c)) {
    const effects = { check: skill.kind === 'passive' ? say('해당 판정마다', 'every matching check', '該当する判定ごと') : say('다음 해당 판정', 'next matching check', '次の該当判定'), heal: 'HP', guard: say('피해 경감', 'damage reduction', '被害軽減'), reward: say('성과 추가', 'extra yield', '成果追加'), travel: say('여행 시간 단축', 'travel hours reduced', '旅時間短縮') };
    lines.push(`${say('본인 스킬', 'Owned skill', '自分のスキル')}: ${fantasySkillName(skill, locale)}; XP ${c.skillXp?.[skill.id]??0}; ${skill.kind === 'passive' ? say('패시브', 'passive', '常時') : say('액티브', 'active', '発動')}; MP ${skill.mp}; ${effects[skill.effect]} +${skill.power}${skill.stat ? ` (${statNames[skill.stat]})` : ''}.`);
  }
  if (c.learnedSkills?.length) lines.push(`${say('사사해 습득한 기술', 'Skills learned from mentors', '師から習得した技能')}: ${fantasySkills(c).filter(skill => c.learnedSkills!.includes(skill.id)).map(skill => fantasySkillName(skill, locale)).join(', ')}.`);
  for (const trait of fantasyBodyTraits(c)) lines.push(`${say('자기 신체 특성', 'Own body trait', '自分の体の特性')}: ${trait.names[locale]}. ${trait.descriptions[locale]}`);
  const body = (Object.keys(FANTASY_CONTEXT_NAMES) as (keyof typeof FANTASY_CONTEXT_NAMES)[]).map(context => ({ context, bonus: fantasyContextBonus(c, context) })).filter(entry => entry.bonus !== 0);
  if (body.length) lines.push(`${say('본인 상황 판정 보정', 'Own situational check modifiers', '自分の状況判定補正')}: ${body.map(({ context, bonus }) => `${FANTASY_CONTEXT_NAMES[context][locale]} ${bonus > 0 ? '+' : ''}${bonus}`).join(', ')}.`);
  if (c.buff) lines.push(`${say('준비 중인 강화', 'Prepared enhancement', '準備中の強化')}: ${c.buff.effect} +${c.buff.power}${c.buff.stat ? ` (${statNames[c.buff.stat]})` : ''}.`);
  if (profile.activity) {
    const { action, endsAt, startedAt } = profile.activity;
    const detail=fantasyGmActivityName(profile,locale);
    const remaining = Math.max(0, endsAt - c.hour);
    lines.push(`${say('진행 중인 활동', 'Current activity', '進行中の行動')}: ${detail}; ${say('게임 시간', 'game hours', 'ゲーム時間')} ${startedAt.toFixed(3)} → ${endsAt.toFixed(3)}; ${say('남은 시간', 'remaining', '残り')} ${remaining.toFixed(3)} h (${(remaining * 60 / FANTASY_WORLD_TIME_RATE).toFixed(1)} ${say('실제 분', 'real minutes', '実分')}). ${say('아직 결과·보상을 받지 않았고 다른 게임 행동은 대기해야 한다.', 'Results and rewards are still pending; other gameplay actions must wait.', '結果や報酬は未確定で、他のゲーム行動は待つ必要がある。')}`);
  }
  for (const [id, count] of Object.entries(c.inventory)) {
    if (count <= 0 || !itemName(id)) continue;
    lines.push(`${say('소지품', 'Inventory', '所持品')}: ${itemName(id)} × ${count}.`);
    if (foodMeta(id)) {
      const sense = foodSense(c, id);
      lines.push(`${say('식품 관찰', 'Food observation', '食品の観察')} (${itemName(id)}): ${sense.appearance[locale]} ${sense.smell[locale]}`);
      if (sense.known) lines.push(`${say('요리사 식재 감별', 'Cook ingredient appraisal', '料理人の食材鑑定')} (${itemName(id)}): age=${sense.known.age.toFixed(3)} h; shelfLife=${sense.known.shelfLife} h; nutrition=${sense.known.nutrition}; quality=${sense.known.quality}.`);
    }
  }
  for (const place of FANTASY_LOCATIONS.filter(place => known.has(place.id))) {
    const visited = c.visited.includes(place.id);
    lines.push(`${visited ? say('방문한 지역', 'Visited region', '訪問済み地域') : say('지도에만 표시된 지역', 'Charted region only', '地図上のみ既知の地域')}: ${placeName(place.id)}${visited ? `; ${say('관찰한 자원', 'observed resources', '観察した資源')}: ${place.resources.map(itemName).filter(Boolean).join(', ')}` : ''}.`);
  }
  for (const quest of FANTASY_QUESTS.filter(quest => c.quests.includes(quest.id) || c.completed.includes(quest.id) || fantasyPersonalQuest(quest)&&fantasyQuestEligible(c,quest)&&quest.giver === c.location)) {
    const text = fantasyQuestText(quest, locale);
    const status = c.completed.includes(quest.id) ? say('완료', 'completed', '達成済み') : c.quests.includes(quest.id) ? say('진행 중', 'accepted', '受注中') : say('현재 수락 가능', 'available here', '現在地で受注可能');
    const task = fantasyTaskObjectiveLabel(quest, locale);
    if (task) { lines.push(`${say('본인이 아는 의뢰', 'Known quest', '自分が知る依頼')}: ${text.name} [${status}]; ${task}; ${say('진행', 'progress', '進行')}: ${fantasyTaskProgress(c, quest)}/${quest.objective!.count}; ${say('현장', 'site', '現地')}: ${placeName(quest.destination)}; ${say('보고', 'report', '報告')}: ${placeName(quest.giver)}. ${quest.gold} G, ${quest.xp} XP.`); continue; }
    lines.push(`${say('본인이 아는 의뢰', 'Known quest', '自分が知る依頼')}: ${text.name} [${status}]; ${say('의뢰인 위치', 'giver location', '依頼人の場所')}: ${placeName(quest.giver)}; ${say('목적지', 'destination', '目的地')}: ${placeName(quest.destination)}; ${itemName(quest.item)} ${c.inventory[quest.item] ?? 0}/${quest.count}; ${quest.gold} G, ${quest.xp} XP.${known.has(quest.destination) ? ` ${text.description}` : ''}${quest.chapter ? ` ${fantasyMainGuidance(c, quest.id, locale)}` : ''}`);
  }
  const buildings = fantasyBuildings(c);
  lines.push(`${say('현재 시설', 'Current facilities', '現在地の施設')}: ${buildings.map(building => building.name[locale]).join(', ') || say('없음', 'none', 'なし')}.`);
  const npcIds = new Set(buildings.flatMap(building => building.npcIds));
  for (const npc of NPC_PUBLIC.filter(npc => npc.homeLocation === c.location && (npc.building === 'residence' || npcIds.has(npc.id)))) {
    lines.push(`${say('현재 장소의 공개 인물 정보', 'Local public NPC profile', '現在地の公開人物情報')}: ${npc.name[locale]}; ${npc.role[locale]}; ${npc.age}; ${npc.personality[locale]} ${say('알려진 전문 분야', 'public areas of expertise', '公の専門分野')}: ${npc.knownTopics[locale].join(', ')}.`);
  }
  const event = FANTASY_EVENTS.find(event => event.id === profile.event && fantasyEventEligible(c, event));
  if (event) {
    const text = fantasyEventText(event, locale);
    lines.push(`${say('현재 발생한 사건', 'Current event', '発生中の事件')}: ${text.name}. ${text.description}`);
    for (const choice of event.choices) lines.push(`${say('미실행 선택지', 'Unexecuted choice', '未実行の選択肢')}: ${text.choices[choice.id]}; ${statNames[fantasyEncounterChoiceStat(event.id, choice.id, fantasyCombatStat(c)) ?? choice.stat]} DC${choice.dc}${choice.context ? `; ${FANTASY_CONTEXT_NAMES[choice.context][locale]} ${fantasyContextBonus(c, choice.context)}` : ''}.`);
  }
  return conceal(lines.join('\n'));
}
