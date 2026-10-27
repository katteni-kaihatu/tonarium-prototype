export function fantasyDefinitionSubject(text: string): string | undefined {
  const query = text.normalize('NFKC').toLowerCase().replace(/’/gu, "'").trim();
  if (!query || query.length > 100 || /[\n\r\p{Cc}\p{Cf}<>{}\[\]]/u.test(query)) return undefined;
  if (/(?:^|\s)(?:너|당신|내|제|저의)(?:는|가|의|게|\s|$)|너에게|너의|네가|당신|あなた|きみ|君(?:は|が|の|に)|私|僕|俺|\b(?:you|your|yours|my|our)\b/u.test(query)) return undefined;
  const match = query.match(/^(.{1,40}?)(?:은|는|이|가)?\s*(?:뭐야|뭔데|뭔가요|무엇(?:이야|인가요|입니까)?|어디(?:야|인가요|에\s*있어)|(?:무슨|뭔)\s*뜻(?:이야|인가요|입니까|이에요)?)[?!.。！？]*$/u)
    ?? query.match(/^(.{1,40}?)(?:って(?:何|なに)(?:なの|ですか)?|ってどういう意味(?:ですか)?|とは(?:(?:何|なに)(?:ですか|なの)?)?|の意味(?:は(?:何|なに))?(?:ですか|を教えて)?|は(?:何|なに|どこ)(?:ですか|なの)?)[?!.。！？]*$/u)
    ?? query.match(/^(?:what(?:'s| is| are)|where(?:'s| is| are)|meaning of)\s+(?:a |an |the )?([a-z][a-z0-9 '\-]{0,40})[?!.]*$/u)
    ?? query.match(/^what (?:does|do)\s+([a-z][a-z0-9 '\-]{0,40})\s+mean[?!.]*$/u)
    ?? query.match(/^(.{1,40}?)(?:에\s*대해|에\s*관해)\s*(?:알려줘|설명해줘|알려주세요)[?!.。！？]*$/u)
    ?? query.match(/^(?:tell me about|explain)\s+([a-z][a-z0-9 '\-]{0,40})[?!.]*$/u)
    ?? query.match(/^(.{1,40}?)について(?:教えて|説明して)(?:ください)?[?!.。！？]*$/u);
  const subject = match?.[1]?.trim().replace(/^["'「『“]+|["'」』”]+$/gu, '');
  if (!subject || /[?!.。！？、,;:]|\b(?:and|or|but|because|how|why)\b|그리고|하면서|고\s*싶|왜|어떻게|(?:와|과|랑)\s|(?:と|や).*(?:何|どこ)/u.test(subject)) return undefined;
  if (/방법|준비할|준비해야|하는\s*게|方法|過ごし方|用意|\b(?:good|nice|best|fun|favorite|favourite) (?:way|thing|drink|meal|evening)\b|\b(?:way to|reason for|meaningful|relax)\b/u.test(subject)) return undefined;
  if (/행복|삶|인생|사랑|친구|꿈|고민|두려움|외로|친절|대화|정의|용기|믿음|happiness|love|life|friendship|fear|stress|sadness|lonel|kindness|conversation|justice|courage|faith|幸せ|人生|愛|友情|夢|悩み|寂し|親切|会話|勇気|信仰/u.test(subject)) return undefined;
  if (/^(?:여기|이곳|현재\s*위치|지금|시간|날씨|가격|재고|소문|진행도|직업|종족|기술|스킬|이름|상태|here|this|that|time|weather|price|stock|rumors?|progress|job|race|skill|name|status|ここ|今|時間|天気|値段|在庫|噂|進捗|職業|種族|技能|名前|状態)$/u.test(subject)) return undefined;
  if (/^(?:피로도?|허기|배고픔|숙련도|신앙|전투|평판|흥정|노숙|사망|계절|fatigue|hunger|proficiency|combat|reputation|bargaining|camping|death|seasons?|疲労|空腹|熟練度|戦闘|評判|野宿|死亡|季節)$/u.test(subject)) return undefined;
  return subject;
}

export const fantasyInquiryKey = (text: string) => text.normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
