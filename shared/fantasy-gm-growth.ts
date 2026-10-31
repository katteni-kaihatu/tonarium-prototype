import type { FantasyGmReply } from './fantasy-gm.ts';
import type { FantasyProfile } from './fantasy.ts';
import type { NpcLocale } from './npc.ts';
import { NPC_PUBLIC } from './npc.ts';
import { FANTASY_JOBS, FANTASY_LOCATIONS, FANTASY_RECIPES } from './fantasy-data.ts';
import { fantasyLifeJob } from './fantasy-careers.ts';
import { fantasySkills } from './fantasy-engine.ts';
import { fantasyBuildings, fantasyCanCraft } from './fantasy-town.ts';
import { fantasySkillName } from './fantasy-skill-names.ts';
import { fantasyGmActivityName } from './fantasy-gm-locale.ts';
import { fantasyMana } from './fantasy-mana.ts';
import { fantasyPrayerStatus } from './fantasy-prayer.ts';
import { fantasyCanRegisterGuild } from './fantasy-guild-progression.ts';

export function fantasyGmGrowthQuestion(text: string): boolean {
  const query = String(text ?? '').slice(0, 500).normalize('NFKC').toLowerCase();
  return /성장|강해지|강해질|강해져|레벨\s*업|成長|強くな|レベル.*上げ|레벨.*올|숙련.*(?:올|쌓|높)|熟練.*(?:上|高)|\bgrow stronger\b|\bgrowth\b|\blevel up\b|\b(?:get|become) stronger\b|\bhow (?:can|do|should) i grow\b/.test(query)
    || /(?:키우|늘리|높이|향상|improv|develop|育て|伸ば|高め)/.test(query)
      && /마나|숙련|스킬|기술|능력치|직업|내\s*캐릭터|\b(?:mana|mastery|skills?|stats?|profession|my character)\b|マナ|熟練|スキル|技能|能力|職業/.test(query);
}

export function fantasyGmGrowthReply(profile: FantasyProfile, locale: NpcLocale): FantasyGmReply | undefined {
  const c = profile.character;
  const main = FANTASY_JOBS.find(job => job.id === c?.job);
  if (!c || !main || !FANTASY_LOCATIONS.some(place => place.id === c.location)) return undefined;
  const say = (ko: string, en: string, ja: string) => ({ ko, en, ja })[locale];
  const life = FANTASY_JOBS.find(job => job.id === fantasyLifeJob(c));
  const careers = [main, ...(life && life.id !== main.id ? [life] : [])];
  const buildings = fantasyBuildings(c);
  const has = (id: string) => buildings.some(building => building.id === id);
  const parts = [say(
    `현재 직업과 숙련은 ${careers.map(job => `${job.names.ko} ${c.jobXp[job.id] ?? 0}`).join(' · ')}입니다.`,
    `Current professions and proficiency: ${careers.map(job => `${job.names.en} ${c.jobXp[job.id] ?? 0}`).join(' · ')}.`,
    `現在の職業と熟練：${careers.map(job => `${job.names.ja} ${c.jobXp[job.id] ?? 0}`).join('・')}。`,
  )];
  if (profile.activity) parts.push(say(
    `지금은 ${fantasyGmActivityName(profile, locale)} 중입니다. 현재 활동의 완료를 기다린 뒤 다음 활동을 선택하십시오.`,
    `You are ${fantasyGmActivityName(profile, locale)}. Wait for this activity to finish before choosing the next one.`,
    `いまは${fantasyGmActivityName(profile, locale)}の最中です。現在の活動が完了してから次の活動を選んでください。`,
  ));
  if (main.category === 'none') parts.push(say(
    '먼저 관심 있는 직업을 정하고 그 직업을 가르치는 주민에게 상담하십시오.',
    'First choose a profession that interests you and consult a resident who teaches it.',
    'まず関心のある職業を選び、その職業を教える住民に相談してください。',
  ));
  else parts.push(say(
    '직업에 맞는 일과 의뢰, 실제로 효과를 낸 기술 사용을 이어 가십시오. 같은 행동의 반복은 성장 효율이 줄어드므로 상황에 맞게 활동을 바꾸는 편이 좋습니다.',
    'Continue work and contracts suited to your profession, and use skills where they have a real effect. Repeating the same action reduces growth efficiency; vary your activities to suit the situation.',
    '職業に合う仕事や依頼、実際に役立つ技能の使用を続けてください。同じ行動の反復は成長効率が下がるため、状況に応じて活動を変えるとよいでしょう。',
  ));
  if (life) {
    const craftable = FANTASY_RECIPES.some(recipe => recipe.job === life.id && fantasyCanCraft(c, recipe));
    parts.push(say(
      `${life.names.ko}의 일은 해당 생활직 숙련을 따로 쌓습니다.${craftable ? ' 현재 지역에는 해당 직업의 제작 시설이 있습니다. 재료와 제작 조건을 확인하십시오.' : ' 생산·채집 활동은 현재 지역의 시설·자원·도구 조건을 먼저 확인하십시오.'}`,
      `Work as ${life.names.en} builds that life profession's own proficiency.${craftable ? ' This area has a suitable crafting facility. Check materials and crafting requirements.' : ' Check local facilities, resources and tools before production or gathering.'}`,
      `${life.names.ja}の仕事では生活職の熟練を別に積みます。${craftable ? '現在地には対応する製作設備があります。材料と製作条件を確認してください。' : '生産や採集では、現地の設備・資源・道具の条件を先に確認してください。'}`,
    ));
  }
  const active = fantasySkills(c).find(skill => skill.kind === 'active' && skill.mp > 0 && skill.restore !== 'mp');
  const mana = fantasyMana(c);
  parts.push(say(
    `마나 단계 ${mana.stage} · 제어 ${mana.mastery} · 과부하 ${mana.strain}입니다. 마나는 실제로 효과를 낸 MP 사용을 꾸준히 이어 갈 때 성장합니다. 강화는 준비만 하지 말고 해당 행동에 실제로 소비해야 하며, 회복은 실제 HP를 회복해야 합니다.${active ? ` 이미 익힌 ${fantasySkillName(active, locale)}의 용도와 MP를 확인하십시오.` : ' 먼저 사용 가능한 기술을 확인하십시오.'} 별도 마나 수련 명령은 필요하지 않습니다.`,
    `Mana stage ${mana.stage} · control ${mana.mastery} · strain ${mana.strain}. Mana grows through sustained, effective MP use. Prepared buffs must actually be consumed by a matching action; healing must restore real HP.${active ? ` Check the purpose and MP cost of your known skill, ${fantasySkillName(active, locale)}.` : ' First check your available skills.'} No separate mana training command is needed.`,
    `マナ段階${mana.stage}・制御${mana.mastery}・負荷${mana.strain}です。マナは実際に効果を生むMP使用を続けることで育ちます。強化は準備だけでなく対応する行動で消費し、回復は実際にHPを回復する必要があります。${active ? `習得済みの${fantasySkillName(active, locale)}の用途とMPを確認してください。` : 'まず使える技能を確認してください。'}別のマナ修練命令は必要ありません。`,
  ));
  if (c.job === 'priest') {
    const prayer = fantasyPrayerStatus(c);
    parts.push(prayer.used ? say(
      '오늘은 이미 기도했습니다. 다음 세계의 날에 다시 기도할 수 있습니다.', 'You have already prayed today. Return on the next world day.', '今日はすでに祈りました。次の世界日に再び祈れます。',
    ) : say('기도는 세계의 하루에 한 번입니다. 신전에서 기도하십시오.', 'Prayer is once per world day, at a temple.', '祈りは世界の一日に一度です。神殿で祈ってください。'));
    parts.push(say(
      '신앙은 신전 의뢰와 봉사, 교리 독서, 순례와 약속의 이행, 전투에서 동료에게 실제로 도움이 된 지원으로 쌓으십시오. 성직 등급과 혜택은 신전에서 확인하십시오.',
      'Build faith through temple commissions and service, doctrine reading, pilgrimage, fulfilled vows and effective support for allies in battle. Consult a temple about clergy rank and benefits.',
      '信仰は神殿の依頼や奉仕、教義の読書、巡礼、誓約の履行、戦闘で仲間に実際に役立つ支援で積んでください。聖職の等級と特典は神殿で確認してください。',
    ));
  } else if (main.category === 'crime') parts.push(say(
    '뒷골목의 의뢰와 조직 신뢰를 확인하십시오. 범죄 활동에는 악명과 법 집행의 위험이 따릅니다.',
    'Check underworld contracts and organizational trust. Criminal activity carries notoriety and law-enforcement risks.',
    '裏社会の依頼や組織の信頼を確認してください。犯罪活動には悪名と法の取り締まりの危険があります。',
  ));
  else if (fantasyCanRegisterGuild(c)) parts.push(say(
    c.guildProgress ? '길드 등급은 해당 등급의 의뢰 실적으로 오릅니다. 현재 등급의 의뢰와 혜택은 길드에서 확인하십시오.' : '길드에 등록하면 의뢰 실적에 따른 등급과 혜택을 확인할 수 있습니다.',
    c.guildProgress ? 'Guild rank advances through contracts at your current grade. Check current contracts and benefits at the guild.' : 'Register at a guild to track contract-based rank and benefits.',
    c.guildProgress ? 'ギルド等級は現在の等級での依頼実績で上がります。現等級の依頼と特典はギルドで確認してください。' : 'ギルドに登録すると、依頼実績による等級と特典を確認できます。',
  ));
  const localTeacher = NPC_PUBLIC.some(npc => npc.homeLocation === c.location && careers.some(job => npc.trainableJobs?.includes(job.id))
    && buildings.some(building => building.id === npc.building && building.npcIds.includes(npc.id)));
  parts.push(say(
    `${has('library') ? '현재 지역의 도서관' : '알고 있는 지역의 도서관'}에서 직업 관련 도서와 단서를 살피십시오. ${localTeacher ? '현재 지역에 해당 직업을 가르치는 주민이 있습니다.' : '해당 직업을 가르치는 주민을 만나 지도받을 수 있는지 상담하십시오.'} 새로운 길의 세부 조건은 여정에서 직접 발견해야 합니다.`,
    `Study profession-related books and clues in ${has('library') ? 'the local library' : 'libraries in known settlements'}. ${localTeacher ? 'A resident here teaches one of your professions.' : 'Consult residents who teach your profession about available instruction.'} Discover the detailed conditions of new paths through your journey.`,
    `${has('library') ? '現在地の図書館' : '既知の町の図書館'}で職業に関する本や手掛かりを調べてください。${localTeacher ? '現在地には該当職業を教える住民がいます。' : 'その職業を教える住民に指導について相談してください。'}新しい道の詳しい条件は旅の中で自分で見つけてください。`,
  ));
  return { text: parts.join('\n'), suggestions: [] };
}
