export type NpcProfileQuestion = 'identity' | 'age' | 'gender' | 'race' | 'job' | 'personality' | 'relationship';

const questions: Record<NpcProfileQuestion, readonly RegExp[]> = {
  identity: [
    /^(?:(?:너|당신)(?:는|의|가)?\s*)?(?:누구(?:야|세요|니|신가요)|(?:네\s*|너의\s*|당신의\s*)?(?:이름|성함)(?:이|은|을)?\s*(?:뭐야|뭔가요|알려줘|알려주세요)?)$/u,
    /^(?:who are you|what(?:'s| is) your name|your name|tell me your name)$/u,
    /^(?:あなたは)?(?:誰(?:ですか|なの)?|(?:お)?名前(?:は|を教えて)?(?:何ですか|なんですか)?)$/u,
  ],
  age: [/^(?:(?:너|당신|네)(?:는|의)?\s*)?(?:몇\s*살(?:이야|이세요|이에요|인가요)?|(?:나이|연세)(?:가|는|를)?\s*(?:어떻게\s*돼|얼마야|어떻게\s*되세요|몇이야|알려줘|알려주세요)?)$/u, /^(?:how old are you|what(?:'s| is) your age|your age)$/u, /^(?:(?:あなたは)?何歳(?:ですか|なの)?|年齢(?:は|を教えて)?)$/u],
  gender: [/^(?:(?:너|당신|네)(?:는|의)?\s*)?(?:성별(?:이|은|을)?\s*(?:뭐야|뭔가요|알려줘|알려주세요)?|남자(?:야|예요|인가요)|여자(?:야|예요|인가요))$/u, /^(?:what(?:'s| is) your gender|your gender|are you (?:male|female|a man|a woman))$/u, /^(?:性別(?:は|を教えて)?|(?:あなたは)?(?:男性|女性)(?:ですか|なの)?)$/u],
  race: [/^(?:(?:너|당신|네)(?:는|의)?\s*)?종족(?:이|은|을)?\s*(?:뭐야|뭔가요|무엇인가요|알려줘|알려주세요)?$/u, /^(?:what(?:'s| is) your (?:race|species)|your (?:race|species)|what (?:race|species) are you)$/u, /^(?:種族(?:は|を教えて)?|(?:あなたは)?何の種族(?:ですか|なの)?)$/u],
  job: [/^(?:(?:너|당신|네)(?:는|의)?\s*)?(?:직업(?:이|은|을)?\s*(?:뭐야|뭔가요|알려줘|알려주세요)?|(?:무슨|어떤)\s*일(?:을)?\s*(?:해|하세요|하니|하고\s*있어))$/u, /^(?:what do you do(?: for (?:work|a living))?|what(?:'s| is) your (?:job|occupation)|your (?:job|occupation))$/u, /^(?:職業(?:は|を教えて)?|(?:あなたは)?(?:何の|どんな)仕事(?:をしている|をしていますか|ですか|なの)?)$/u],
  personality: [/^(?:(?:너|당신|네)(?:는|의)?\s*)?(?:성격|말투)(?:이|가|은|는|을|를)?\s*(?:어때|어떤가요|어때요|알려줘|알려주세요)?$/u, /^(?:what(?:'s| is) your (?:personality|speech) like|tell me about your personality|your personality)$/u, /^(?:どんな(?:性格|話し方)(?:ですか|なの)?|(?:性格|口調|話し方)(?:は|を教えて)?)$/u],
  relationship: [/^(?:(?:우리|우리의)\s*관계(?:는|가|를)?\s*(?:어때|어떤가요|뭐야|알려줘)?|(?:너|당신)(?:는|은)?\s*나(?:를)?\s*기억(?:해|하니|하세요)|나(?:를)?\s*기억(?:해|하니|하세요))$/u, /^(?:what(?:'s| is) our relationship|how do you (?:see|feel about) me|do you remember me|our relationship|remember me)$/u, /^(?:私たちの関係(?:は|を教えて)?|私(?:のこと|を)?(?:は)?覚えて(?:いる|いますか))$/u],
};

export function npcQuestionKey(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/’/gu,"'").trim().replace(/[.!?。！？]+$/u,'').trim().replace(/\s+/gu,' ');
}

export function npcHasMultipleRequests(text: string): boolean {
  const key=npcQuestionKey(text).replace(/(?<=\d)\.(?=\d)/gu,'')
    .replace(/[.!?。！？]+\s*(?:가르쳐(?:줘|주세요)|教えて(?:ください)?|(?:please )?teach me)$/u,'');
  return /[.!?。！？\n\r]/u.test(key)
    || /\b(?:and|but|also|then)\s+(?:what|why|how|where|when|who|can|could|do|would|tell|show|give|buy|sell)\b/u.test(key)
    || /(?:그리고|그런데|또한|또|그러면)\s*(?:왜|어떻게|어디|언제|누구|뭐|무엇|알려|추천|보여|사줘|팔아)/u.test(key)
    || /(?:それと|それから|あと|そして).*(?:何|なぜ|どこ|どう|教えて|見せて|買って)/u.test(key);
}

export function npcProfileQuestion(text: string): NpcProfileQuestion | undefined {
  if(typeof text!=='string'||!text.trim()||text.length>120||/[\p{Cc}\p{Cf}<>{}\[\]]/u.test(text)||npcHasMultipleRequests(text))return undefined;
  const key=npcQuestionKey(text);
  return (Object.keys(questions) as NpcProfileQuestion[]).find(topic=>questions[topic].some(pattern=>pattern.test(key)));
}
