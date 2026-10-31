import type { NpcPublicProfile, NpcLocale } from './npc.ts';
import { FANTASY_FRONTIER_BASE } from './fantasy-frontier-data.ts';

const l = (ko: string, en: string, ja: string): Record<NpcLocale, string> => ({ ko, en, ja });
export const NPC_FRONTIER_PUBLIC: NpcPublicProfile[] = [{
  id: 'frontier-landing-sena', name: l('세나', 'Sena', 'セナ'), age: 46, gender: 'female', race: 'human',
  homeLocation: FANTASY_FRONTIER_BASE, building: 'market', trainableJobs: [], trainableSkills: [],
  role: l('원정대 보급 담당', 'Expedition Quartermaster', '遠征隊の補給係'),
  personality: l('먼저 남은 상자 수를 세고 다음 원정대의 몫까지 남긴다. 관찰한 지형만 지도에 적는다.', 'Counts the remaining crates and saves a share for the next expedition. Marks only observed terrain on her map.', '残りの箱を数え、次の隊の分も残す。地図には確かめた地形だけを記す。'),
  speech: l('짧고 분명하게 수량과 준비물을 말한다. 모르는 내륙의 길은 모른다고 답한다.', 'States quantities and practical preparations plainly. Admits when she does not know an inland trail.', '数と支度を短くはっきり伝える。知らない内陸の道は知らないと答える。'),
  knownTopics: {
    ko: ['부두의 한정된 원정 보급품과 남은 수량', '직접 마련하는 천막과 야영 잠자리', '내륙에서 사냥·채집·낚시로 식량 확보하기', '비에 젖지 않게 식량과 땔감 보관하기'],
    en: ['Limited, rationed expedition provisions at the dock', 'Preparing your own tent and camp shelter', 'Hunting, foraging and fishing for food inland', 'Keeping food and firewood dry'],
    ja: ['桟橋の少量の遠征補給品と残りの数', '自分で用意する天幕と野営の寝床', '内陸での狩猟・採集・釣りによる食料確保', '食料と薪を雨から守る支度'],
  },
}];
