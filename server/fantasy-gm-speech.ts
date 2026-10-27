export function fantasyGmSpokenText(value: string): string {
  const plain = value.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/<think>[\s\S]*$/gi, '').trim().slice(0, 2400);
  const answer = plain.split(/(?:^|\n)\s*(?:[#*>-]+\s*)?(?:추천\s*질문|추가\s*질문|권장\s*질문|suggested\s*(?:follow[- ]?up\s*)?questions?|recommended\s*questions?|follow[- ]?up\s*questions?|おすすめの質問|次の質問|追加の質問)\s*[:：]/iu)[0];
  return (answer.match(/[^.!?。！？]+[.!?。！？]?/gu) ?? [])
    .filter(sentence => !/[?？]/u.test(sentence))
    .join('').trim();
}
