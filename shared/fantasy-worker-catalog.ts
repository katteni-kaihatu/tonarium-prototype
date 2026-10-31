import type { NpcLocale } from './npc.ts';
type Text = Record<NpcLocale, string>;
const l = (ko: string, en: string, ja: string): Text => ({ ko, en, ja });
export const FANTASY_BUSINESS_JOBS = ['merchant', 'cook', 'blacksmith', 'carpenter', 'tailor', 'weaver', 'leatherworker', 'gemcutter', 'herbalist', 'baker', 'potter', 'shipwright', 'scribe', 'alchemist', 'farmer', 'fisher'] as const;
// Existing IDs retain their original profession when the job catalog expands.
const establishedJobs = FANTASY_BUSINESS_JOBS.slice(0, 14);
const names = [
  l('라온', 'Raon', 'ラオン'), l('모린', 'Morin', 'モリン'), l('타르크', 'Tark', 'タルク'), l('셀리네', 'Seline', 'セリネ'), l('보르카', 'Borka', 'ボルカ'), l('이나리', 'Inari', 'イナリ'),
  l('도란', 'Doran', 'ドラン'), l('엘비', 'Elvi', 'エルヴィ'), l('나루', 'Naru', 'ナル'), l('그룬', 'Grun', 'グルン'), l('미엘', 'Miel', 'ミエル'), l('헤스', 'Hess', 'ヘス'),
  l('로사', 'Rosa', 'ロサ'), l('트린', 'Trin', 'トリン'), l('가르브', 'Garb', 'ガルブ'), l('루네', 'Rune', 'ルネ'), l('오르나', 'Orna', 'オルナ'), l('시엘', 'Ciel', 'シエル'),
  l('바룸', 'Barum', 'バルム'), l('에린', 'Erin', 'エリン'), l('누리', 'Nuri', 'ヌリ'), l('크란', 'Kran', 'クラン'), l('리시아', 'Lisia', 'リシア'), l('페른', 'Fern', 'フェルン'),
  l('우르칸', 'Urkan', 'ウルカン'), l('아샤', 'Asha', 'アシャ'), l('타엘', 'Tael', 'タエル'), l('고르마', 'Gorma', 'ゴルマ'), l('니마', 'Nima', 'ニマ'), l('실렌', 'Silen', 'シレン'),
  l('비렌', 'Viren', 'ヴィレン'), l('마레', 'Mare', 'マレ'),
];
export const FANTASY_BUSINESS_WORKERS = names.map((names, i) => ({ id: `artisan-${i + 1}`, names, race: i >= 24 && i < 30 ? ['orc', 'wolfkin', 'elf', 'orc', 'foxkin', 'elf'][i - 24] : ['human', 'dwarf', 'orc', 'elf', 'catkin', 'halfling'][i % 6], source: (i < 24 || i >= 30 ? 'guild' : 'blackMarket') as 'guild' | 'blackMarket',
  job: i >= 30 ? FANTASY_BUSINESS_JOBS[i - 16] : establishedJobs[i % establishedJobs.length], combatJob: i >= 24 && i < 30 ? ['warrior', 'archer', 'mage', 'warrior', 'ranger', 'priest'][i - 24] : undefined,
  fee: i < 24 || i >= 30 ? 65 + i % 5 * 15 : 420 + (i - 24) * 70, wage: i < 24 || i >= 30 ? 3 : 4,
  learning: 1 + i * 7 % 5, initialXp: 8 + i * 37 % 180,
}));
