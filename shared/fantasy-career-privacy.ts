import { FANTASY_JOB_PATHS } from './fantasy-job-paths.ts';
import { FANTASY_PRIEST_BRANCHES } from './fantasy-priest-growth.ts';
import type { NpcLocale } from './npc.ts';

export function fantasyPrivateCareerQuestion(text: string): boolean {
  const query = text.normalize('NFKC').toLowerCase();
  const named = [...FANTASY_JOB_PATHS, ...FANTASY_PRIEST_BRANCHES].some(path => Object.values(path.names).some(name => query.includes(name.toLowerCase())));
  const specialty = named || /세부|전문\s*직|분기|신앙의\s*길|speciali[sz]|subclass|sacred\s*path|専門|分岐|信仰の道/i.test(query);
  const prerequisites = /조건|자격|요건|해금|prerequis|requirements?|eligib|unlock|条件|資格|解放/i.test(query);
  const becoming = /되려|되려면|되는|전직|바꾸려|become|advance|speciali[sz]e|転職|なる|変更/i.test(query);
  const method = /방법|어떻게|필요|얼마|몇|how|need|minimum|方法|必要|どう|いくつ/i.test(query);
  return specialty && (prerequisites || becoming && method);
}

export function fantasyPrivateCareerReply(locale: NpcLocale, npc = false): string {
  if (npc) return {
    ko: '그 길에 관한 답은 남의 말만으로 얻기 어려워요. 당신의 여정에서 직접 찾아보세요.',
    en: 'That path is not something another person can explain for you. Discover it through your own journey.',
    ja: 'その道の答えは、人の言葉だけでは得られません。自分の旅の中で見つけてください。',
  }[locale];
  return {
    ko: '새로운 길은 여정 속에서 직접 발견해야 해. 지금까지 네가 쌓은 경험과 선택한 분야에 관해서는 이야기해 줄 수 있어.',
    en: 'Discover that path through your own journey. We can discuss the experience you have gained and the field you have chosen.',
    ja: '新しい道は旅の中で自分で見つけてください。これまで積んだ経験や選んだ分野についてなら話せます。',
  }[locale];
}
