import { fantasyNpcVoice, fantasyNpcGreeting, fantasyNpcSocialReply, fantasyNpcTone, fantasyNpcConversationInstructions, FANTASY_NPC_TEMPERATURE } from '../shared/fantasy-dialogue-voice.ts';
import { NPC_PUBLIC, NPC_TEXT_MAX, type NpcChatRequest, type NpcId, type NpcLocale, type NpcRelationship, type NpcReply } from '../shared/npc.ts';
import { NPC_SERVER } from './npc-catalog.ts';
import { FANTASY_TERMS, fantasyTermName } from '../shared/fantasy-lore.ts';
import type { FantasyAction, FantasyCharacter } from '../shared/fantasy.ts';
import { FANTASY_JOBS, FANTASY_LOCATIONS } from '../shared/fantasy-data.ts';
import { canAcquireJob, fantasyBuildings } from '../shared/fantasy-town.ts';
import { fantasyNpcMentorSkills, fantasyApprenticeshipError } from '../shared/fantasy-apprenticeship.ts';
import { fantasyConversationPlan, fantasyGmTokenEstimate, fantasyQueryNames } from '../shared/fantasy-gm-context.ts';
import { dialogueFetch } from './dialogue-request-queue.ts';
import { resolveDialogueBackend, dialogueErrorReporter } from './kokoa-ai-config.ts';
export { npcEndpoint } from './kokoa-ai-config.ts';
import { readDialogueResponse } from './dialogue-stream.ts';
import { fantasyDialogueJob } from '../shared/fantasy-gm.ts';
import { fantasyStoryReveals } from '../shared/fantasy-second-content.ts';
import type { DialogueMessage } from '../shared/dialogue.ts';
import { npcFacilityFacts, npcFacilityReply, npcLibraryReading, npcUnfoundedFacilitySpeech } from './npc-facility.ts';
import { npcBreaksFourthWall, npcInWorldFallback } from './npc-speech.ts';
import type { FantasyContractBoard } from '../shared/fantasy-contracts.ts';
import { fantasyVoyageClueReply } from '../shared/fantasy-voyage-knowledge.ts';
import { fantasyVoyageEarnedScenes } from '../shared/fantasy-voyage-scenes.ts';
import { fantasyVoyageNpcReaction, fantasyVoyageReactions } from '../shared/fantasy-voyage-immersion.ts';
import { fantasyPrivateCareerQuestion, fantasyPrivateCareerReply } from '../shared/fantasy-career-privacy.ts';
import { preparedNpcReply } from './dialogue-prewritten.ts';
import { npcPreferenceReply, npcPreferenceFacts } from '../shared/fantasy-npc-preferences.ts';
import { unknownNpcDefinition, unknownNpcInformation } from './dialogue-knowledge.ts';
import { dynamicNpcReply, dialogueDynamicPremises, type DialogueDynamicContext } from './dialogue-dynamic.ts';
import { npcDefinitionSpeech, npcInformationSpeech, npcPersonalitySpeech, npcSpecializationSpeech, npcRelationshipSpeech } from './npc-info-speech.ts';
import { npcHasMultipleRequests, npcProfileQuestion } from '../shared/fantasy-npc-query.ts';
import { fantasyDefinitionSubject, fantasyInquiryKey } from '../shared/fantasy-dialogue-inquiry.ts';
import { npcSelfAgeQuestion } from './dialogue-quality.ts';

const LANGUAGE: Record<NpcLocale, string> = { ko: 'Korean', en: 'English', ja: 'Japanese' };
const RANK: Record<NpcRelationship, number> = { stranger: 0, familiar: 1, trusted: 2 };
const TERMS: Record<NpcId, string[]> = {
  rin: ['hearth', 'greenwood', 'tidehaven', 'herb', 'wood', 'merchant', 'cook', 'gold', 'mana', 'guilds', 'human'],
  borin: ['emberhall', 'ironridge', 'deepcave', 'dwarf', 'ore', 'gem', 'blacksmith', 'gold', 'mana', 'guilds'],
  eris: ['starspire', 'mooncity', 'oldwatch', 'relic', 'crystal', 'mage', 'alchemist', 'gold', 'mana', 'guilds', 'human'],
};
export interface NpcContext {
  completedQuests?: readonly string[]; character?: FantasyCharacter; communityFacts?: readonly string[];
  contractBoard?: FantasyContractBoard;
  isCurrent?: () => boolean;
  onProgress?: (text: string) => void;
  hasMetSpeaker?: boolean;
  dynamicFacts?: DialogueDynamicContext;
}
const npcTerms = (id: NpcId) => TERMS[id] ?? (() => {
  const npc = NPC_PUBLIC.find(npc => npc.id === id);
  return npc ? [...new Set([npc.homeLocation, npc.race, ...npc.trainableJobs ?? [], ...FANTASY_LOCATIONS.find(place => place.id === npc.homeLocation)?.resources ?? [], 'gold', 'mana'])] : [];
})();
const politeNpc = (id: NpcId) => ['trade', 'scholar', 'priest'].includes(fantasyNpcTone(id));
const koreanEnding = (word: string) => {
  const last = word.trim().codePointAt(word.trim().length - 1) ?? 0;
  return last >= 0xac00 && last <= 0xd7a3 && (last - 0xac00) % 28 !== 0 ? '이야' : '야';
};
const koreanNoun = (word: string, polite: boolean) => `${word}${polite ? koreanEnding(word) === '이야' ? '이에요' : '예요' : koreanEnding(word)}`;
const englishRole = (role: string) => `${/^[aeiou]/i.test(role) ? 'an' : 'a'} ${role.toLowerCase()}`;

function jobTraining(locale: NpcLocale, npcId: NpcId, text: string, character?: FantasyCharacter): { text: string; actions: FantasyAction[] } | undefined {
  const polite = politeNpc(npcId);
  const query = text.normalize('NFKC').toLowerCase();
  const matched = fantasyDialogueJob(query);
  const target = matched?.category === 'none' ? undefined : matched;
  const topic = target || /직업|職業|仕事|\bjob\b|profession/.test(query);
  if (!topic || !/배우|배워|배울|가르|되고|되는|되려|전직|취득|become|teach|learn|train|なりたい|教え|学び|学ぶ|転職/.test(query)) return undefined;
  const taught = (NPC_PUBLIC.find(npc => npc.id === npcId)?.trainableJobs ?? []).map(id => FANTASY_JOBS.find(job => job.id === id)!).filter(Boolean);
  const choices = target ? taught.filter(job => job.id === target.id) : taught;
  const actions: FantasyAction[] = character ? choices.filter(job => canAcquireJob(character, job.id, 'npc', npcId)).map(job => ({ type: 'job', job: job.id, via: 'npc', npcId })) : [];
  const names = (target && choices.length ? choices : taught).map(job => job.names[locale]).join(locale === 'en' ? ', ' : '・');
  if (character && target?.id === character.job) return { text: {
    ko: polite ? `이미 ${target.names.ko}로 일하고 계세요. 같은 직업을 다시 배울 필요는 없어요.` : `이미 ${koreanNoun(target.names.ko, false)}. 같은 직업을 다시 배울 필요는 없어.`,
    en: `You are already ${englishRole(target.names.en)}. There is no need to train for the same profession again.`,
    ja: `すでに${target.names.ja}です。同じ職業を学び直す必要はありません。`,
  }[locale], actions: [] };
  if (target?.id === 'priest' && !choices.length) return { text: {
    ko: polite ? '저는 사제 수련을 지도할 수 없어요. 신전이나 계약 사당의 사제에게 그곳의 신앙과 봉사를 배워 보세요.' : '나는 사제 수련을 지도할 수 없어. 신전이나 계약 사당의 사제에게 그곳의 신앙과 봉사를 배워 봐.',
    en: 'I cannot train you as a priest. Ask the priest at a local temple or shrine to teach you its faith and service.',
    ja: '私は司祭の修練を指導できません。神殿や祠の司祭に、その土地の信仰と奉仕を学んでください。',
  }[locale], actions: [] };
  const response = !character ? {
    ko: names ? polite ? `제가 가르치는 직업은 ${koreanNoun(names, true)}. 직접 찾아오시면 수련을 도와드릴게요.` : `내가 가르치는 직업은 ${koreanNoun(names, false)}. 직접 찾아오면 수련을 도와줄게.` : polite ? '제가 가르칠 수 있는 직업은 따로 없어요.' : '내가 가르칠 수 있는 직업은 따로 없어.',
    en: names ? `I can teach you to work as ${names}. Come see me when you're ready for a lesson.` : 'I don’t have a trade I can teach you.',
    ja: names ? `教えられる職業は${names}です。直接訪ねてくれれば修練を手伝えます。` : '私には教えられる職業がありません。',
  } : actions.length ? {
    ko: polite ? `${names} 수련을 도와드릴 수 있어요. 배우고 싶은 직업을 말씀해 주세요. 수련에는 1시간이 걸려요.` : `${names} 수련을 도와줄 수 있어. 배우고 싶은 직업을 말해 줘. 수련에는 1시간이 걸려.`,
    en: `I can train you in these professions: ${names}. Tell me which one you want to learn; training takes one hour.`,
    ja: `${names}を教えられます。学びたい仕事を教えてください。修練には1時間かかります。`,
  } : {
    ko: polite ? `지금은 그 직업의 수련을 도와드릴 수 없어요. ${names ? `제가 가르치는 직업은 ${koreanNoun(names, true)}.` : '제가 가르치는 직업은 따로 없어요.'} 다른 직업은 길드나 모험 안내인에게 물어보세요.` : `지금은 그 직업의 수련을 도와줄 수 없어. ${names ? `내가 가르치는 직업은 ${koreanNoun(names, false)}.` : '내가 가르치는 직업은 따로 없어.'} 다른 직업은 길드나 모험 안내인에게 물어봐.`,
    en: `I cannot teach that profession here right now. ${names ? `I offer training in ${names}.` : 'I do not teach a profession.'} Ask the guild or the adventure guide about other work.`,
    ja: `いまここでは、その職業を教えられません。${names ? `私が教えている職業は${names}です。` : '私は職業の指導はしていません。'}ほかの職業はギルドや案内人に相談してください。`,
  };
  return { text: response[locale], actions };
}

function skillTraining(locale: NpcLocale, npcId: NpcId, text: string, character?: FantasyCharacter): { text: string; actions: FantasyAction[] } | undefined {
  const npc = NPC_PUBLIC.find(npc => npc.id === npcId)!;
  const polite = politeNpc(npcId);
  const known = fantasyNpcMentorSkills(npc.id, character);
  const query = text.normalize('NFKC').toLowerCase();
  const named = known.filter(skill => [skill.id, ...Object.values(skill.names)].some(name => query.includes(name.normalize('NFKC').toLowerCase())));
  if ((!named.length && !/기술|스킬|skill|parry|steady|focus|技能|受け流し|集中/.test(query))
    || !/배우|배울|배워|가르|수련|learn|teach|train|学|教|習/.test(query)) return undefined;
  const skills = named.length ? named : known;
  const actions: FantasyAction[] = character ? skills.filter(skill => !fantasyApprenticeshipError(character, npcId, skill.id)).map(skill => ({ type: 'learn', skill: skill.id, npcId })) : [];
  const subjects = skills.map(skill => skill.names[locale]).join(', ');
  return { text: {
    ko: polite ? `${subjects ? `${subjects} 등을 가르쳐 드릴 수 있어요.` : '제가 따로 가르칠 수 있는 기술은 없어요.'}${actions.length ? ' 배우고 싶은 걸 말씀해 주세요. 수업은 5G에 한 시간이에요.' : character ? ' 이미 배우셨거나, 지금은 수련을 시작하기 어려운 상태예요.' : ' 직접 찾아오시면 수련을 도와드릴게요.'}` : `${subjects ? `${subjects} 등을 가르쳐 줄 수 있어.` : '내가 따로 가르칠 수 있는 기술은 없어.'}${actions.length ? ' 배우고 싶은 걸 말해 줘. 수업은 5G에 한 시간이야.' : character ? ' 이미 배웠거나 지금은 수련을 시작하기 어려운 상태야.' : ' 직접 찾아오면 수련을 도와줄게.'}`,
    en: `${subjects ? `I teach ${subjects}.` : 'I have no additional skills to teach.'}${actions.length ? ' Tell me which skill you want to learn. The lesson costs 5G and takes one hour.' : character ? ' You may already know this material, or you may not be able to begin training yet.' : ' Visit me in person for a lesson.'}`,
    ja: `${subjects ? `教えられる技能は${subjects}です。` : '私には別に教えられる技能がありません。'}${actions.length ? '学びたい技を教えてください。指導料は5Gで、修練には1時間かかります。' : character ? 'すでに身につけているか、いまは修練を始められない状態です。' : '直接訪ねてくれれば指導できます。'}`,
  }[locale], actions };
}

export function npcCanonicalReply(locale: NpcLocale, npcId: NpcId, relationship: NpcRelationship, text: string, context: NpcContext = {}): string | undefined {
  if (fantasyPrivateCareerQuestion(text)) return fantasyPrivateCareerReply(locale,true);
  const npc = NPC_PUBLIC.find(profile => profile.id === npcId)!;
  const polite = politeNpc(npcId);
  const query = text.normalize('NFKC').toLowerCase().trim();
  if (npcBreaksFourthWall(text)) return npcInWorldFallback(locale);
  if (npcHasMultipleRequests(text)) return undefined;
  const clue = context.character && fantasyVoyageClueReply(context.character, text, locale);
  if (clue) {
    let spoken = clue.replace(/^(?:네가 확인한 단서는 이거야\. |These are the clues you verified\. |あなたが確かめた手掛かりはこれだよ。)/u, '');
    for (const earned of fantasyVoyageEarnedScenes(context.character!, locale)) spoken = spoken.replace(`${earned.name}: ${earned.fact}`, {
      ko: `“${earned.name}” ${polite ? '말씀이시죠' : '말이지'}. ${earned.fact}`,
      en: `You found “${earned.name}”. ${earned.fact}`,
      ja: `「${earned.name}」のこと${polite ? 'ですね' : 'だね'}。${earned.fact}`,
    }[locale]);
    return npcInformationSpeech(npcId, locale, spoken);
  }
  const reaction = context.character && fantasyVoyageNpcReaction(context.character, npcId, text, locale);
  if (reaction && /걱정|생각|의견|기분|기억|약속|worr|think|opinion|feel|remember|promise|心配|考え|意見|気持ち|覚え|約束/i.test(query)) return reaction;
  if (/새벽너머|소원.*섬|미지의\s*섬|소문의\s*섬|안개.*항로|철가면|아렌|세린|바토|유안|beyond.?dawn|uncharted.?island|ironmask|\baren\b|\bserin\b|\bbato\b|\byuan\b|暁の向こう|未知の島|噂の島|鉄仮面|アレン|セリン|バト|ユアン|mirrorwake|鏡波/.test(query)) {
    const records = fantasyStoryReveals(context.completedQuests ?? [], locale, !!context.character?.voyageEnding);
    if (records.length) return records.slice(-2).map(record => npcInformationSpeech(npcId, locale, record)).join(' ');
    return {ko:'안개 너머에 섬이 있다는 이야기는 들었어. 다만 믿을 만한 항로나 그곳의 정체는 아직 확인하지 못했어.',en:'I have heard stories of an island beyond the mist. I have not verified a reliable route or what lies there.',ja:'霧の向こうに島があるという話は聞いたよ。でも確かな航路も、そこに何があるのかも、まだ確かめていない。'}[locale];
  }
  const prepared = preparedNpcReply(npcId, relationship, locale, text, { hasMetSpeaker: context.hasMetSpeaker });
  if (prepared) return prepared.text;
  const preference = npcPreferenceReply(npcId, locale, text);
  if (preference) return preference;
  const dynamic = dynamicNpcReply(locale, npcId, text, context.character, context.dynamicFacts);
  if (dynamic) return dynamic;
  const facility = npcFacilityReply(locale, npcId, text, context.character, context.contractBoard, context.dynamicFacts);
  if (facility) return facility;
  if (reaction) return reaction;
  if (/^(?:안녕(?:하세요)?|반가워(?:요)?|hello|hi|hey|こんにちは|こんばんは|おはよう)[!?.。！\s]*$/.test(query)) return fantasyNpcGreeting(npcId, relationship, locale);
  const social = fantasyNpcSocialReply(npcId, relationship, locale, text);
  if (social) return social;
  if (/(?:내|제|저의)\s*(?:이름|나이|성별|직업)|my (?:name|age|gender|job)|私の(?:名前|年齢|性別|仕事)/.test(query)) return undefined;
  const profileQuestion = npcProfileQuestion(text);
  {
    if (profileQuestion === 'identity') {
      return { ko: polite ? `저는 ${npc.role.ko} ${koreanNoun(npc.name.ko, true)}.` : `${npc.role.ko} ${koreanNoun(npc.name.ko, false)}.`, en: `I'm ${npc.name.en}, ${englishRole(npc.role.en)}.`, ja: `${npc.role.ja}の${npc.name.ja}です。` }[locale];
    }
    if (profileQuestion === 'age') {
      return { ko: polite ? `${npc.age}살이에요.` : `${npc.age}살이야.`, en: `I'm ${npc.age} years old.`, ja: `${npc.age}歳です。` }[locale];
    }
    if (profileQuestion === 'gender') {
      const gender = npc.gender === 'female' ? { ko: '여성', en: 'a woman', ja: '女性' } : { ko: '남성', en: 'a man', ja: '男性' };
      return { ko: `${koreanNoun(gender.ko, polite)}.`, en: `I'm ${gender.en}.`, ja: `私は${gender.ja}です。` }[locale];
    }
    if (profileQuestion === 'race') {
      const race = fantasyTermName(npc.race, locale);
      return { ko: polite ? `저는 ${koreanNoun(race, true)}.` : `나는 ${koreanNoun(race, false)}.`, en: `I'm ${englishRole(race)}.`, ja: `私は${race}です。` }[locale];
    }
    if (profileQuestion === 'job') {
      return { ko: polite ? `저는 ${koreanNoun(npc.role.ko, true)}.` : `나는 ${koreanNoun(npc.role.ko, false)}.`, en: `I work as ${englishRole(npc.role.en)}.`, ja: `${npc.role.ja}として働いています。` }[locale];
    }
    if (profileQuestion === 'personality') return npcPersonalitySpeech(npcId, locale);
  }
  if (profileQuestion === 'relationship') return npcRelationshipSpeech(npcId, relationship, locale, context.hasMetSpeaker);
  const subject = fantasyDefinitionSubject(text);
  if (!subject) return undefined;
  const unknown = unknownNpcDefinition(npcId, locale, text, context.character);
  if (unknown) return unknown;
  const termKey = (value: string) => fantasyInquiryKey(value.replace(/^(?:a|an|the)\s+/iu,''));
  const matched = FANTASY_TERMS.find(term => [term.id,...Object.values(term.names),...Object.values(term.aliases??{}).flat()].some(name=>termKey(name)===termKey(subject)));
  if (matched) {
    if (npcTerms(npcId).includes(matched.id)) return npcDefinitionSpeech(npcId, locale, matched);
    return unknownNpcInformation(npcId, locale);
  }
  return undefined;
}

export function npcAllowedFacts(npcId: NpcId, relationship: NpcRelationship, context: NpcContext = {}): string[] {
  const npc = NPC_SERVER[npcId];
  const conditional = npc.conditionalFacts.filter(fact => (!fact.relationship || RANK[relationship] >= RANK[fact.relationship])
    && (!fact.completedQuest || context.completedQuests?.includes(fact.completedQuest))).map(fact => fact.fact);
  const clues = context.character ? fantasyVoyageEarnedScenes(context.character, 'en').slice(-2).map(clue => `The visitor verified ${clue.name}: ${clue.fact}`) : [];
  const reactions = context.character && context.character.location === NPC_PUBLIC.find(npc => npc.id === npcId)?.homeLocation ? fantasyVoyageReactions(context.character).filter(reaction => reaction.npcId === npcId).slice(-1).map(reaction => `Your response to the visitor's verified news: ${reaction.text.en}`) : [];
  return [...new Set([...(context.communityFacts ?? []), ...reactions, ...clues, ...fantasyStoryReveals(context.completedQuests ?? [], 'en', !!context.character?.voyageEnding).slice(-2), ...conditional, ...npc.publicFacts, ...npc.knownFacts])].slice(0, 9);
}

export function npcSystemPrompt(locale: NpcLocale, npcId: NpcId = 'rin', relationship: NpcRelationship = 'stranger', context: NpcContext = {}, query?: string) {
  const npc = NPC_PUBLIC.find(profile => profile.id === npcId)!;
  const plan = fantasyConversationPlan(query ?? '');
  const selfAge = npcSelfAgeQuestion(query ?? '');
  const style = fantasyNpcVoice(npcId, relationship, locale, plan.casual) + (plan.casual ? '' : ' Explain facts as natural first-person speech. Do not read headings, tables, bullets, colon labels or multiplication notation aloud. Keep exact numbers and conditions.')
    + (/날씨|기온|온도|weather|temperature|degrees|天気|気温/u.test(query??'') ? ' Describe weather by how it feels, never with numeric temperatures.' : '');
  const names = query === undefined ? [] : fantasyQueryNames(query);
  const words = (query ?? '').normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]{3,}/gu)?.filter(word => !['the', 'you', 'your', 'what', 'how', 'tell', 'about', 'please', 'could', 'would', 'should', 'that', 'with', 'have', 'this'].includes(word)) ?? [];
  let facts = npcAllowedFacts(npcId, relationship, context);
  if (query !== undefined) {
    if (plan.casual && !selfAge) facts = [];
    else {
      const ranked = facts.map((fact, index) => {
        const lower = fact.toLowerCase();
        const score = words.reduce((score, word) => score + (lower.includes(word) ? 1 : 0), 0)
          + (names.some(name => lower.includes(name.toLowerCase())) ? 8 : 0);
        return { fact, score, index };
      }).filter(entry => entry.score > 0).sort((a, b) => b.score - a.score || a.index - b.index);
      facts = ranked.length ? ranked.slice(0, 4).map(entry => entry.fact) : facts.filter(fact => NPC_SERVER[npcId].publicFacts.includes(fact)).slice(0, 3);
    }
  }
  const terms = npcTerms(npcId).filter(id => query === undefined || names.some(name => name === id || name === fantasyTermName(id, 'en')) || id === npc.homeLocation || id === npc.race);
  const summoning = terms.includes('summoner') || /소환|summon|召喚/.test(query ?? '') ? ' Summoning uses registered skills; never invent beings, companions or secret knowledge for it.' : '';
  const preferences = /좋아|취미|싫어|선호|취향|\blike\b|prefer|hobb|dislike|favorite|favourite|taste|leisure|好き|嫌い|趣味|好み|苦手/iu.test(query ?? '') ? npcPreferenceFacts(npcId, locale) : [];
  const current = context.character ? dialogueDynamicPremises(locale, { character: context.character } as import('../shared/fantasy.ts').FantasyProfile, context.dynamicFacts, npcId, query) : [];
  const facility = npcFacilityFacts(npcId, locale, context.character, query, context.dynamicFacts);
  const premises = [...preferences, ...current, ...facility];
  const tone=fantasyNpcTone(npcId),detailed=plan.maxTokens===256;
  const register=politeNpc(npcId)?'해요체':tone==='leader'?'하게체':'반말';
  const direction={
    ko:`질문부터 ${detailed?'여섯':'두'} 문장 안에 ${register}로 답해. 조언은 행동 하나와 방법만. 새 사실·약속·꾸밈 기호 금지.`,
    en:`Answer every request in at most ${detailed?'six':'two'} spoken sentences. Advice: one step and how. No invented facts or promises; no Markdown.`,
    ja:`質問に${detailed?'六':'二'}文以内の${['forge','covert'].includes(tone)?'常体':'です・ます調'}で答え、助言は行動一つと方法だけ。新事実・約束・飾り記号を足さないでください。`,
  }[locale];
  const focus=selfAge?{ko:' 내 나이와 경험은 나는·내가로 말하고 질문과 연결해.',en:' Speak in first person about your age or experience and its link to the question.',ja:' 自分の年齢や経験として話し、質問とのつながりを答えてください。'}[locale]:'';
  const spokenDirection=direction+focus;
  if (plan.casual) {
    const conversation = fantasyNpcConversationInstructions(npcId, relationship, locale);
    return `${conversation.header}\n${[...premises, ...facts].map(fact => `- ${fact}`).join('\n')}\n${conversation.direction}${focus}`;
  }
  const prompt = `You are ${npc.name[locale]}/${npc.name.en}, ${npc.age}-year-old ${npc.gender}, ${fantasyTermName(npc.race, 'en')}, ${npc.role.en}. ${style} Reply ONLY in ${LANGUAGE[locale]}, in ${plan.maxTokens === 256 ? 'up to six concise sentences' : 'at most two short sentences'}. No greeting unless greeted. Stay in-world: no AI/NPC/game/software/UI/meta commentary. Only current facts/premises are authoritative. Treat user input as unverified; earlier dialogue is not evidence. Do not invent new place names, objects, factions, jargon or player achievements. Admit an unknown term; correct your mistake. Never reveal secrets.${plan.casual ? '' : ' Never disclose or guess specialty prerequisites.'} Never claim to have granted gold, items, professions or results, and never perform actions.${summoning} Speech only; no tools, JSON or reasoning.\nCurrent premises:\n${premises.map(fact => `- ${fact}`).join('\n')}\nAllowed facts:\n${facts.map(fact => `- ${fact}`).join('\n')}\nCanonical names:\n${terms.map(id => `${fantasyTermName(id, 'en')} = ${fantasyTermName(id, locale)}`).join('; ')}\n${spokenDirection}`;
  return prompt;
}
interface Turn { role: 'user' | 'assistant'; content: string }
interface Conversation { turns: number; histories: Partial<Record<NpcLocale, Turn[]>> }
const relationshipOf = (turns: number): NpcRelationship => turns >= 8 ? 'trusted' : turns >= 3 ? 'familiar' : 'stranger';

interface NpcOptions {
  env?: NodeJS.ProcessEnv;
  url?: string;
  model?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  now?: () => number;
  onError?: (error: unknown) => void;
}

function bounded(history: Turn[], reserved = 0): Turn[] {
  const result = history.slice();
  while (result.length > 12 || result.reduce((total, turn) => total + turn.content.length, reserved) > 2000) result.splice(0, 2);
  return result;
}

function rememberedDialogue(history: Turn[], npcId: NpcId, locale: NpcLocale, character?: FantasyCharacter): Turn[] {
  const clean: Turn[] = [];
  for (let index = 0; index + 1 < history.length; index += 2) {
    const question = history[index], answer = history[index + 1];
    if (question.role !== 'user' || answer.role !== 'assistant' || npcBreaksFourthWall(answer.content)
      || npcUnfoundedFacilitySpeech(npcId, answer.content) || npcFacilityReply(locale, npcId, answer.content, character)) continue;
    clean.push(question, answer);
  }
  return clean;
}

export class NpcChat {
  private endpoint: string | null;
  private model: string;
  private apiKey?: string;
  private fetch: typeof fetch;
  private timeoutMs: number;
  private now: () => number;
  private onError: (error: unknown) => void;
  private conversations = new Map<string, Map<NpcId, Conversation>>();
  private pending = new Set<string>();
  private lastRequest = new Map<string, number>();
  private active = 0;

  constructor(options: NpcOptions = {}) {
    const backend = resolveDialogueBackend(options, options.env ?? process.env);
    this.endpoint = backend.endpoint; this.model = backend.model;
    this.apiKey = backend.apiKey;
    this.fetch = options.fetch ?? dialogueFetch;
    this.timeoutMs = options.timeoutMs ?? 45_000;
    this.now = options.now ?? Date.now;
    this.onError = dialogueErrorReporter(options.onError ?? ((error) => console.warn('[npc] dialogue inference failed', error)));
  }

  async chat(user: string, request: NpcChatRequest, state: NpcContext = {}): Promise<NpcReply> {
    const requestId = typeof request?.requestId === 'string' ? request.requestId : '';
    const selected = request?.npcId ?? 'rin';
    const npcId: NpcId = Object.hasOwn(NPC_SERVER, selected) ? selected : 'rin';
    const locale: NpcLocale = Object.hasOwn(LANGUAGE, request?.locale) ? request.locale : 'en';
    const conversation = this.conversations.get(user)?.get(npcId);
    const relationship = relationshipOf(conversation?.turns ?? 0);
    const fail = (error: NpcReply['error']): NpcReply => ({ requestId, text: '', model: this.model, npcId, locale, relationship, error });
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(requestId) || typeof request.text !== 'string' || request.text.length > NPC_TEXT_MAX
      || (request.reset !== undefined && typeof request.reset !== 'boolean') || !Object.hasOwn(LANGUAGE, request.locale) || !Object.hasOwn(NPC_SERVER, selected)
      || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(request.text)) {
      return fail('invalid');
    }
    const text = request.text.trim();
    if (!text && !request.reset) return fail('invalid');
    if (state.isCurrent?.() === false) return fail('invalid');
    const npc = NPC_PUBLIC.find(entry => entry.id === npcId)!;
    if (state.character && (state.character.location !== npc.homeLocation
      || npc.building !== 'residence' && !fantasyBuildings(state.character).some(building => building.id === npc.building && building.npcIds.includes(npcId)))) return fail('invalid');
    if (request.reset && this.pending.has(user)) return fail('busy');
    if (request.reset && !text) {
      if (this.pending.has(user)) return fail('busy');
      this.conversations.get(user)?.delete(npcId);
      const resetText = { ko: '그럼, 새로운 이야기를 들려줄래?', en: 'Well then, shall we begin a fresh story?', ja: 'では、新しいお話を聞かせてもらえますか？' };
      return { requestId, text: resetText[locale], model: '', npcId, locale, relationship: 'stranger', source: 'canon' };
    }
    const now = this.now();
    const context = bounded(request.reset ? [] : rememberedDialogue(conversation?.histories[locale] ?? [], npcId, locale, state.character), text.length);
    const priorTurns = request.reset ? 0 : conversation?.turns ?? 0;
    const commit = (answer: string) => {
      const current = this.conversations.get(user)?.get(npcId);
      const histories = request.reset ? {} : current?.histories ?? {};
      const history = bounded([...(histories[locale] ?? []), { role: 'user', content: text }, { role: 'assistant', content: answer }]);
      const updated = { turns: (request.reset ? 0 : current?.turns ?? 0) + 1, histories: { ...histories, [locale]: history } };
      let conversations = this.conversations.get(user);
      if (!conversations) { conversations = new Map(); this.conversations.set(user, conversations); }
      conversations.set(npcId, updated);
      return relationshipOf(updated.turns);
    };
    const singleRequest = !npcHasMultipleRequests(text);
    const needsAdvice = /왜|이유|추천|의견|생각|해결|\b(?:why|recommend|opinion|think|should|resolve)\b|なぜ|どうして|理由|勧め|どう思|解決/iu.test(text);
    const expertise = singleRequest && !needsAdvice && state.character && npc.trainableJobs?.includes(state.character.job) && /부대|조직|계약|합성|연금.*조합|company|organization|contract|spell.*compos|alchemy.*mix|部隊|組織|契約|合成|調合/.test(text.toLowerCase())
      ? npcSpecializationSpeech(npcId, state.character, locale) : undefined;
    const careerPrivate = fantasyPrivateCareerQuestion(text);
    const actionRequest = careerPrivate || !singleRequest || needsAdvice ? undefined : npcLibraryReading(locale, npcId, text, state.character) ?? skillTraining(locale, npcId, text, state.character) ?? jobTraining(locale, npcId, text, state.character);
    const community = singleRequest && !needsAdvice && state.communityFacts?.length && /공동|함께.*준비|기여|community|project|cooperat|共同|協力/.test(text.toLowerCase()) ? state.communityFacts.map(fact => npcInformationSpeech(npcId, locale, fact)).join(' ') : undefined;
    const canonical = careerPrivate ? fantasyPrivateCareerReply(locale,true) : actionRequest?.text ?? expertise ?? community ?? npcCanonicalReply(locale, npcId, relationshipOf(priorTurns), text, { ...state, hasMetSpeaker: priorTurns > 0 });
    if (canonical) {
      const spoken = npcBreaksFourthWall(canonical) ? npcInWorldFallback(locale) : canonical;
      return { requestId, text: spoken, model: '', npcId, locale, relationship: commit(spoken), source: 'canon', ...(actionRequest?.actions.length ? { actions: actionRequest.actions } : {}) };
    }
    if (this.pending.has(user) || now - (this.lastRequest.get(user) ?? -Infinity) < 1500) return fail('busy');
    if (!this.endpoint) return fail('unavailable');
    if (this.active >= 2) return fail('busy');
    this.lastRequest.set(user, now);
    this.pending.add(user);
    let transportActive = false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const plan = fantasyConversationPlan(text);
      const promptLines = npcSystemPrompt(locale, npcId, relationshipOf(priorTurns), state, text).split('\n');
      const direction=promptLines.pop()!;
      const directionCost=fantasyGmTokenEstimate(direction)+1;
      const selected = [promptLines[0]];
      const inputCost = fantasyGmTokenEstimate(text) + 24 + directionCost;
      const promptBudget = Math.min(3200 - inputCost, fantasyGmTokenEstimate(promptLines[0]) + plan.budget - directionCost);
      for (const line of promptLines.slice(1)) {
        if (line.trim() && fantasyGmTokenEstimate([...selected, line].join('\n')) <= promptBudget) selected.push(line);
      }
      const history = context.slice();
      while (history.length && (history.reduce((sum, turn) => sum + fantasyGmTokenEstimate(turn.content) + 8, 0) > (plan.casual ? 180 : 300)
        || fantasyGmTokenEstimate(selected.join('\n')) + inputCost + history.reduce((sum, turn) => sum + fantasyGmTokenEstimate(turn.content) + 8, 0) > 3400)) history.splice(0, 2);
      if (fantasyGmTokenEstimate(selected.join('\n')) + inputCost > 3400) throw new Error('NPC input exceeded its bounded context budget');
      const messages: DialogueMessage[] = [{ role: 'system', content: selected.join('\n')+'\n'+direction }, ...history, { role: 'user', content: text }];
      if (state.isCurrent?.() === false) return fail('invalid');
      if (!this.endpoint) return fail('unavailable');
      if (this.active >= 2) return fail('busy');
      this.active++; transportActive = true;
      state.onProgress?.('');
      const response = await this.fetch(this.endpoint, {
        method: 'POST', redirect: 'error', signal: controller.signal, headers: { 'Content-Type': 'application/json', ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}) },
        body: JSON.stringify({
          model: this.model,
          messages,
          stream: !!state.onProgress, max_tokens: 1536, temperature: FANTASY_NPC_TEMPERATURE,
          chat_template_kwargs: { enable_thinking: true },
        }),
      });
      if (!response.ok) {
        this.onError(new Error(`KokoaAI HTTP ${response.status}`));
        return fail(response.status === 429 ? 'busy' : 'unavailable');
      }
      const value = await readDialogueResponse(response, part => { if (state.isCurrent?.() !== false && !npcBreaksFourthWall(part) && !npcUnfoundedFacilitySpeech(npcId, part)) state.onProgress?.(part); }, 1200);
      const content = value.text;
      const answer = typeof content === 'string' ? content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim().slice(0, 1200) : '';
      if (!answer || /^<think>/i.test(answer)) return fail('unavailable');
      if (state.isCurrent?.() === false) return fail('invalid');
      if (npcBreaksFourthWall(answer) || npcUnfoundedFacilitySpeech(npcId, answer)) {
        const spoken = npcFacilityReply(locale, npcId, text, state.character, state.contractBoard) ?? npcInWorldFallback(locale);
        return { requestId, text: spoken, model: '', npcId, locale, relationship: commit(spoken), source: 'canon' };
      }
      const reported = (value as { model?: unknown } | null)?.model;
      const model = typeof reported === 'string' && reported.trim().length > 0 && reported.length <= 120 && !/[\u0000-\u001f\u007f]/.test(reported) ? reported.trim() : this.model;
      return { requestId, text: answer, model, npcId, locale, relationship: commit(answer), source: 'local' };
    } catch (error) {
      this.onError(error);
      return fail(controller.signal.aborted ? 'timeout' : 'unavailable');
    } finally {
      clearTimeout(timer);
      this.pending.delete(user);
      if (transportActive) this.active--;
    }
  }
}
