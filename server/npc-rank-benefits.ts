import type { FantasyAction, FantasyCharacter, FantasySkill } from '../shared/fantasy.ts';
import { NPC_PUBLIC, type NpcLocale } from '../shared/npc.ts';
import { fantasyNpcTone } from '../shared/fantasy-dialogue-voice.ts';
import { fantasyRegisteredGuildGrade, fantasyCanRegisterGuild } from '../shared/fantasy-guild-progression.ts';
import { fantasyGuildRankName } from '../shared/fantasy-adventurer.ts';
import { fantasyPriestGrowthStatus } from '../shared/fantasy-priest-growth.ts';
import { fantasyPriestRankName } from '../shared/fantasy-priest-ranks.ts';
import { FANTASY_JOBS } from '../shared/fantasy-data.ts';
import { fantasySkillName } from '../shared/fantasy-skill-names.ts';
import { fantasyRankBookChoices, fantasyRankBookClaimError, fantasyRankBookEligible, type FantasyRankBookSource } from '../shared/fantasy-rank-rewards.ts';
import { fantasyRankBenefits, fantasyRankBenefitActionError } from '../shared/fantasy-rank-benefits.ts';
import type { FantasyConversationActionContext, FantasyConversationActions } from './fantasy-conversation-actions.ts';

export type FantasyNpcRankBenefitContext = FantasyConversationActionContext & { text: string };
type Source = FantasyRankBookSource;
type Benefit = ReturnType<typeof fantasyRankBenefits>[number];
interface Browsing {
  source: Source; skills: string[]; revision: number; generation: number;
  lifeStartedAt?: number; location: string; locale: NpcLocale; expiresAt: number;
}
const browsing = new Map<string, Browsing>();
const unknown = { handled: false } as const;
const normalize = (text: string) => text.normalize('NFKC').toLowerCase().trim();
const compact = (text: string) => normalize(text).replace(/[\s\p{P}\p{S}]/gu, '');
const rankTopic = /등급|계급|직급|\b(?:ranks?|grades?)\b|等級|階級/u;
const benefitTopic = /혜택|등급\s*보상|승급\s*보상|내\s*보상|\b(?:benefits?|perks?|rank rewards?|my rewards?)\b|特典|昇格報酬|等級報酬|私の報酬/u;
const bookTopic = /기술서|교본|기술\s*책|원하는\s*기술|기술\s*선택|\b(?:manuals?|skill\s*books?|choose\s*(?:a|my|the)?\s*skill)\b|教本|技能書|技術書|好きな技能|技能を選/u;
const claimIntent = /받(?:을|고|겠|아|는)|수령|챙겨|줘|주세요|신청|대여|빌려|\b(?:claim|collect|receive|take|give|borrow|rent)\b|受け取|もら|ください|借り/u;
const returnIntent = /반납|돌려\s*줄|돌려\s*드|\breturn\b|返却|返し/u;
const priestTopic = /사제|성직|신앙|신전|\b(?:priest|clergy|faith|temple)\b|司祭|聖職|信仰|神殿/u;
const adventurerTopic = /모험가|길드|\b(?:adventurer|guild)\b|冒険者|ギルド/u;
const aliases: Record<string, string[]> = {
  'guild-rental': ['원정 장비', '랜턴 대여', '침낭 대여', '대여 장비', 'rental equipment', 'expedition equipment', '貸出装備', '遠征装備'],
  'guild-supplies': ['길드 보급', '보급품', '보급품 우대', 'guild supplies', 'supply discount', '補給品', 'ギルド補給', '補給品の割引'],
  'guild-report': ['정찰 보고서', '정찰 정보', 'scouting report', 'scout report', '偵察報告'],
  'guild-title': ['길드 명예', '모험가 명예', 'guild title', 'adventurer title', 'ギルド名誉'],
  'temple-lodging': ['순례자 숙소', '순례자 숙박', '신전 숙박', 'pilgrim lodging', 'temple lodging', '巡礼者宿舎', '神殿宿泊'],
  'temple-materials': ['성물 재료', '신전 재료', 'sacred materials', 'temple materials', '聖物素材', '神殿素材'],
  'temple-title': ['신전 명예', '성직 명예', 'temple title', 'clergy title', '神殿名誉'],
};
function mentions(query: string, value: string): boolean {
  if (!value) return false;
  const name = normalize(value);
  if (/^[a-z0-9 -]+$/u.test(name)) return new RegExp(`(^|[^a-z0-9])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9])`, 'u').test(query);
  return compact(query).includes(compact(name));
}
function namedSkill(query: string, skill: FantasySkill): boolean {
  return [skill.id, skill.name, ...(['ko', 'en', 'ja'] as const).map(locale => fantasySkillName(skill, locale))].some(name => mentions(query, name));
}
export function clearFantasyNpcRankBenefits(user: string): void {
  for (const key of browsing.keys()) if (JSON.parse(key)[0] === user) browsing.delete(key);
}

/** NPCs may describe public rank rules and propose only actions validated against the current character. */
export function handleFantasyNpcRankBenefits(context: FantasyNpcRankBenefitContext, actions: FantasyConversationActions): { handled: boolean; text?: string } {
  const { user, speaker, locale, profile } = context, c = profile.character;
  if (!c || !['ko', 'en', 'ja'].includes(locale) || typeof context.text !== 'string' || context.text.length > 800) return unknown;
  const npc = speaker === 'gm' ? undefined : NPC_PUBLIC.find(entry => entry.id === speaker);
  if (speaker !== 'gm' && (!npc || npc.travelOnly || npc.homeLocation !== c.location)) return unknown;
  const query = normalize(context.text), key = JSON.stringify([user, speaker]);
  if(npc?.building==='guild'&&!/혜택|등급|할인|보상|묶음|\b(?:benefits?|ranks?|reward|discount|bundle)\b|特典|等級|報酬|割引|給付/u.test(query)&&/보급품|판매|팔|재고|가격|포션|야영도구|\b(?:supplies|sell|stock|wares|price|potions?|camping gear)\b|補給品|販売|在庫|値段|ポーション/u.test(query))return unknown;
  let prior = browsing.get(key);
  if (prior && (prior.expiresAt <= Date.now() || prior.revision !== profile.revision || prior.generation !== (profile.generation ?? 1) || prior.lifeStartedAt !== c.lifeStartedAt || prior.location !== c.location || prior.locale !== locale)) {
    browsing.delete(key); prior = undefined;
  }
  const say = (ko: string, en: string, ja: string) => ({ ko, en, ja })[locale];
  const polite = speaker === 'gm' || !!npc && ['trade', 'scholar', 'priest'].includes(fantasyNpcTone(speaker));
  const leader = !!npc && fantasyNpcTone(speaker) === 'leader';
  const reply = (text: string) => { actions.clear(user, speaker); return { handled: true, text }; };
  const propose = (action: FantasyAction, label: string) => {
    browsing.delete(key);
    return { handled: true, text: actions.propose({ ...context, query: undefined }, [{ action, label }]).text };
  };
  const all = [...fantasyRankBenefits(c, 'adventurer'), ...fantasyRankBenefits(c, 'priest')];
  const named = all.filter(benefit => [benefit.id, ...Object.values(benefit.names), ...(aliases[benefit.claim ?? benefit.id] ?? [])].some(name => mentions(query, name)));
  const number = query.match(/^(?:(?:option|number|선택)\s*)?(\d+)\s*(?:번|번으로|番|番目)?[.!。]?$/u);
  const priorSkill = prior && number ? prior.skills[Number(number[1]) - 1] : undefined;
  const priorNamed = prior && fantasyRankBookChoices(c).some(skill => prior!.skills.includes(skill.id) && namedSkill(query, skill));
  const rewardChoice = /내\s*등급\s*보상|내\s*승급\s*보상|\bmy\s*rank\s*reward\b|私の等級報酬/u.test(query)
    && !named.length && fantasyRankBookEligible(c, priestTopic.test(query) || !adventurerTopic.test(query) && npc?.building === 'temple' ? 'priest' : 'adventurer');
  const book = bookTopic.test(query) || rewardChoice || !!prior && (!!number || !!priorNamed);
  if (!rankTopic.test(query) && !benefitTopic.test(query) && !book && !named.length) return unknown;
  // A profession's unrelated skill or mastery question remains with its ordinary conversation handler.
  if (!benefitTopic.test(query) && !book && !priestTopic.test(query) && !adventurerTopic.test(query) && /요리|대장|연금|도둑|\b(?:cook|smith|alchemist|thief)\b|料理|鍛冶|錬金|盗賊/u.test(query)) return unknown;

  const explicit: Source | undefined = priestTopic.test(query) ? 'priest' : adventurerTopic.test(query) ? 'adventurer' : undefined;
  const local: Source | undefined = npc?.building === 'temple' ? 'priest' : npc?.building === 'guild' ? 'adventurer' : undefined;
  const source: Source = explicit ?? named[0]?.source ?? prior?.source ?? local ?? (c.job === 'priest' ? 'priest' : 'adventurer');
  if (source === 'adventurer' && !fantasyCanRegisterGuild(c)) {
    browsing.delete(key);
    if (npc?.building === 'guild' && returnIntent.test(query) && named.some(benefit => benefit.claim === 'guild-rental')) {
      const action: FantasyAction = { type: 'rankBenefitReturn', benefit: 'guild-rental' };
      const reason = fantasyRankBenefitActionError(c, action, locale);
      return reason ? reply(reason) : propose(action, say('대여 장비 반환', 'Return loan equipment', '貸出道具を返却'));
    }
    if (c.job !== 'priest') return reply(say(
      speaker === 'gm' ? '범죄 직업으로 활동하는 동안에는 모험가 길드 등록·승급 및 등급 혜택을 받을 수 없습니다.' : polite ? '범죄 직업으로 활동 중인 분은 모험가 길드에 등록할 수 없어요. 등급 혜택도 받을 수 없고요.' : leader ? '범죄 직업으로 활동하는 동안에는 길드 등록을 인정할 수 없네. 등급 혜택도 적용하지 않네.' : '범죄 직업으로 활동하는 동안엔 길드에 등록할 수 없어. 등급 혜택도 받을 수 없고.',
      speaker === 'gm' ? 'Guild registration, promotion and rank benefits are not available while practicing a criminal profession.' : 'You cannot register with the adventurer guild while practicing a criminal profession. Guild rank benefits are unavailable too.',
      speaker === 'gm' ? '犯罪職で活動中は冒険者ギルドに登録できず、昇格・等級特典の対象外です。' : '犯罪職で活動している間は冒険者ギルドに登録できません。等級特典も利用できません。'));
    return reply(say(
      speaker === 'gm' ? '사제는 신전의 성직 등급만 적용됩니다. 모험가 등록·승급 및 길드 등급 혜택은 대상이 아닙니다.' : polite ? '사제의 등급과 혜택은 신전에서 관리해요. 길드 모험가 등급은 받지 않아요.' : leader ? '사제의 등급은 신전의 관할이네. 길드 모험가 등급은 부여하지 않네.' : '사제라면 등급은 신전에서 확인하면 돼. 길드 모험가 등급은 받지 않아.',
      speaker === 'gm' ? 'Only temple clergy ranks apply to priests. Guild adventurer registration, promotion and rank benefits do not apply.' : 'The temple manages priest ranks and benefits. Priests do not receive guild adventurer ranks.',
      speaker === 'gm' ? '司祭には神殿の聖職等級のみが適用されます。冒険者登録・昇格・ギルド等級特典の対象外です。' : '司祭の等級と特典は神殿で管理します。ギルドの冒険者等級は受けません。'));
  }
  const facility = source === 'priest' ? say('신전', 'temple', '神殿') : say('길드', 'guild', 'ギルド');
  const directions = () => say(
    speaker === 'gm' ? `${facility}의 담당자에게 등급 혜택을 문의하고 수령하십시오.` : polite ? `그 혜택은 ${facility}에서 담당해요. 그곳 담당자에게 물어보세요.` : leader ? `그 혜택은 ${facility} 소관이네. 그곳 담당자에게 확인하게.` : `그건 ${facility}에서 맡아. 그곳 담당자에게 물어봐.`,
    speaker === 'gm' ? `Ask the ${facility} staff to check and collect rank benefits.` : `The ${facility} handles that benefit. Ask the staff there.`,
    speaker === 'gm' ? `${facility}の担当者に等級特典の確認と受け取りを申し出てください。` : `その特典は${facility}の担当です。そちらの担当者にお尋ねください。`);
  if (speaker !== 'gm' && (!local || local !== source)) { browsing.delete(key); return reply(directions()); }
  if (source === 'priest' && c.job !== 'priest') return reply(say('성직 혜택은 현재 사제로 봉사하는 분에게 적용돼요. 신전에서 현재 자격을 확인해 주세요.', 'Clergy benefits are for those currently serving as priests. Ask the temple to check your standing.', '聖職特典は現在司祭として奉仕する方が対象です。神殿で現在の資格をご確認ください。'));
  const rank = source === 'adventurer' ? fantasyGuildRankName(fantasyRegisteredGuildGrade(c), locale) : fantasyPriestRankName(fantasyPriestGrowthStatus(c).clergyGrade, locale);
  const heading = say(
    speaker === 'gm' ? `현재 ${source === 'adventurer' ? '모험가' : '성직'} 등급은 ${rank}입니다.` : polite ? `현재 ${source === 'adventurer' ? '등록 등급' : '성직 등급'}은 ${rank}이에요.` : leader ? `현재 등록 등급은 ${rank}이네.` : `현재 등록 등급은 ${rank}이야.`,
    `Your current ${source === 'adventurer' ? 'registered adventurer' : 'clergy'} rank is ${rank}.`,
    `現在の${source === 'adventurer' ? '登録冒険者' : '聖職'}等級は${rank}です。`);

  if (book) {
    if (speaker === 'gm') return reply(`${heading}\n${bookStatus(c, source, locale)}\n${directions()}`);
    if (c.rankBookRewards?.[source]) { browsing.delete(key); return reply(`${heading}\n${bookStatus(c, source, locale)}`); }
    const reason = fantasyRankBookClaimError(c, source, undefined, locale);
    if (reason) { browsing.delete(key); return reply(`${heading}\n${reason}`); }
    const choices = fantasyRankBookChoices(c), selected = choices.filter(skill => skill.id === priorSkill || namedSkill(query, skill));
    if (selected.length === 1) {
      const skill = selected[0], error = fantasyRankBookClaimError(c, source, skill.id, locale);
      if (error) return reply(error);
      return propose({ type: 'rankBookClaim', source, skill: skill.id }, say(`${fantasySkillName(skill, locale)} 교본 수령`, `Collect ${fantasySkillName(skill, locale)} manual`, `${fantasySkillName(skill, locale)}の教本を受け取る`));
    }
    if (!choices.length) { browsing.delete(key); return reply(say('지금 직업에서 교본으로 새로 배울 일반 기술은 없어요. 다른 직업으로 바꾼 뒤 다시 확인할 수 있어요.', 'There are no new ordinary skills to choose for your current profession. You can check again after changing profession.', '現在の職業で教本から新しく学べる通常技能はありません。職業を変えた後、もう一度確認できます。')); }
    for (const [id, entry] of browsing) if (entry.expiresAt <= Date.now()) browsing.delete(id);
    if (browsing.size >= 5000) browsing.delete(browsing.keys().next().value!);
    browsing.set(key, { source, skills: choices.map(skill => skill.id), revision: profile.revision, generation: profile.generation ?? 1, lifeStartedAt: c.lifeStartedAt, location: c.location, locale, expiresAt: Date.now() + 120_000 });
    const list = choices.map((skill, index) => `${index + 1}. ${fantasySkillName(skill, locale)}`).join('\n');
    return reply(`${heading}\n${say('이번 삶에 한 권을 골라 받을 수 있어요. 받을 교본의 기술 이름이나 번호를 알려 주세요. 받은 뒤 소지품에서 읽어야 배울 수 있어요.', 'You may choose one manual in this life. Tell me the skill name or number; read the manual from your belongings afterward to learn it.', '今の人生で教本を1冊選べます。技能名か番号を教えてください。受け取った後、持ち物から読むと習得できます。')}\n${list}`);
  }

  browsing.delete(key);
  const specific = named.filter(benefit => benefit.source === source);
  if (specific.length === 1 && (claimIntent.test(query) || returnIntent.test(query))) {
    const benefit = specific[0];
    if (speaker === 'gm') return reply(`${heading}\n${directions()}`);
    const action: FantasyAction | undefined = returnIntent.test(query) && benefit.claim === 'guild-rental'
      ? { type: 'rankBenefitReturn', benefit: 'guild-rental' }
      : benefit.claim && !returnIntent.test(query) ? { type: 'rankBenefitClaim', benefit: benefit.claim } : undefined;
    if (action) {
      const error = fantasyRankBenefitActionError(c, action, locale);
      return error ? reply(error) : propose(action, benefit.names[locale]);
    }
  }
  const onlyClaimed = /이미\s*(?:받|수령)|받은\s*(?:혜택|보상|목록)|수령\s*(?:완료|내역)|\b(?:already\s*claimed|claimed\s*(?:benefits|rewards)|received\s*(?:benefits|rewards))\b|受取済|受領済/u.test(query);
  const onlyAvailable = /받을\s*수\s*있는|수령\s*가능|아직\s*(?:안|못)\s*받|\b(?:available|unclaimed)\b|受取可能|未受領/u.test(query);
  const benefits = specific.length ? specific : fantasyRankBenefits(c, source).filter(benefit => benefit.unlocked
    && (!onlyClaimed || benefit.claimed || benefit.loaned)
    && (!onlyAvailable || benefit.claim && !fantasyRankBenefitActionError(c, { type: 'rankBenefitClaim', benefit: benefit.claim }, locale)));
  const lines = benefits.map(benefit => benefitLine(c, benefit, locale));
  if (!specific.length && (!onlyClaimed || c.rankBookRewards?.[source]) && (!onlyAvailable || !fantasyRankBookClaimError(c, source, undefined, locale))) lines.push(bookStatus(c, source, locale));
  if (!lines.length) lines.push(say('그 조건에 맞는 등급 혜택은 지금 없어요.', 'There are no rank benefits matching that request right now.', 'その条件に合う等級特典はいまありません。'));
  return reply([heading, ...lines, speaker === 'gm' ? directions() : say(polite ? '받고 싶은 혜택이나 교본의 이름을 말씀해 주세요.' : leader ? '받을 혜택이나 교본의 이름을 말하게.' : '받고 싶은 혜택이나 교본 이름을 말해 줘.', 'Tell me the name of the benefit or manual you want.', '希望する特典や教本の名前を教えてください。')].join('\n'));
}

function bookStatus(c: FantasyCharacter, source: Source, locale: NpcLocale): string {
  const reward = c.rankBookRewards?.[source], say = (ko: string, en: string, ja: string) => ({ ko, en, ja })[locale];
  if (reward) {
    const skill = FANTASY_JOBS.flatMap(job => job.skills).find(skill => skill.id === reward.skill);
    const name = skill ? fantasySkillName(skill, locale) : say('선택한 기술', 'selected skill', '選択した技能');
    return say(`${name} 교본: 이번 삶에 수령 완료${reward.readAt === undefined ? ' · 소지품에서 읽으면 습득' : ' · 읽고 습득 완료'}.`, `${name} manual: claimed in this life${reward.readAt === undefined ? '; read it from your belongings to learn it' : '; read and learned'}.`, `${name}の教本：今の人生で受取済み${reward.readAt === undefined ? '・持ち物から読むと習得' : '・読了、習得済み'}。`);
  }
  return fantasyRankBookEligible(c, source)
    ? say('선택 교본 1권: 아직 받지 않았어요. 「기술서 목록」을 물어보면 현재 직업에서 고를 수 있는 기술을 안내해요.', 'One choice of manual: unclaimed. Ask for the skill book list to see choices for your current profession.', '選べる教本1冊：未受領です。「技能書一覧」と聞くと現在の職業で選べる技能をご案内します。')
    : say(`선택 교본 1권: ${source === 'adventurer' ? '등록 모험가 6등급' : '성직 4등급'}부터 받을 수 있어요.`, `One choice of manual becomes available at ${source === 'adventurer' ? 'registered adventurer rank 6' : 'clergy rank 4'}.`, `選べる教本1冊は${source === 'adventurer' ? '登録冒険者等級6' : '聖職等級4'}から受け取れます。`);
}

function benefitLine(c: FantasyCharacter, benefit: Benefit, locale: NpcLocale): string {
  const say = (ko: string, en: string, ja: string) => ({ ko, en, ja })[locale];
  const state = !benefit.unlocked ? say(`${benefit.grade}등급 필요`, `rank ${benefit.grade} required`, `等級${benefit.grade}が必要`)
    : benefit.loaned ? say('대여 중 · 반납 가능', 'on loan; return available', '貸出中・返却可能')
    : benefit.claimed && benefit.claim !== 'guild-rental' ? say(benefit.daily ? '오늘 수령 완료' : '이번 삶에 수령 완료', benefit.daily ? 'claimed today' : 'claimed in this life', benefit.daily ? '本日受取済み' : '今の人生で受取済み')
    : benefit.claim ? fantasyRankBenefitActionError(c, { type: 'rankBenefitClaim', benefit: benefit.claim }, locale) ?? say('수령 가능', 'available to claim', '受取可能')
    : say('이용 가능', 'available', '利用可能');
  return `${benefit.names[locale]}: ${benefit.descriptions[locale]} (${state})`;
}
