export function npcReadingSubject(text: string): string | undefined {
  const query = text.normalize('NFKC').trim();
  if (/안\s*읽|읽지\s*않|읽고\s*싶지|읽기\s*싫|\b(?:don['’]t|do\s+not|never)\b|読みたくない|読まない|読まなくて|読むのをやめ/iu.test(query)) return undefined;
  const korean = /(?:읽고\s*싶(?:어(?:요)?|습니다|다|은데(?:요)?)|읽을(?:래|게)(?:요)?|읽겠(?:어(?:요)?|습니다)|읽어\s*(?:줘(?:요)?|주세요|볼래(?:요)?)|읽어도\s*(?:될까(?:요)?|돼(?:요)?|되나요)|읽어\s*보고\s*싶(?:어(?:요)?|습니다)|(?:정독|열람)(?:하고\s*싶(?:어(?:요)?|습니다)|할래(?:요)?|해\s*주세요))[.!?。！？\s]*$/u.exec(query);
  const japanese = /(?:読みたい(?:です)?|読みます|読ませて(?:ください)?|読んでみたい(?:です)?|読んでもいい(?:ですか)?|(?:閲覧|精読)(?:したい(?:です)?|します|させて(?:ください)?))[.!?。！？\s]*$/u.exec(query);
  const suffix = korean ?? japanese;
  if (suffix) return query.slice(0, suffix.index).trim()
    .replace(/^(?:(?:저|나)(?:는|도)\s+|(?:그럼|이제|제발)\s+)/u, '')
    .replace(/(?:을|를|を)\s*$/u, '').trim()
    .replace(/(?:이라는|이란|라는)?\s*(?:책|도서|서적)\s*$/u, '').trim();
  const english = /^(?:please[,\s]+)?(?:(?:i\s+(?:want|would\s+like|would\s+love)\s+to|i['’]d\s+like\s+to|(?:can|could|may)\s+i|let['’]s|let\s+me|i['’]ll|i\s+will)\s+)?(?:read|study|browse)(?:\s+([\s\S]*?))?[.!?\s]*$/iu.exec(query);
  if (english) return (english[1] ?? '').replace(/[,\s]+please[.!?\s]*$/iu, '').trim()
    .replace(/^(?:(?:a|the|this|that)\s+)?book\s+(?:(?:called|titled)\s+)?/iu, '').trim();
  return undefined;
}

export function npcReadingRequest(text: string): boolean {
  return npcReadingSubject(text) !== undefined;
}
