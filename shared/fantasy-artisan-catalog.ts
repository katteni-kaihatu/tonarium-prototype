import type { FantasyBuildingId } from './fantasy-town.ts';
import type { FantasyCharacter } from './fantasy.ts';
import type { NpcLocale } from './npc.ts';

export interface FantasyArtisan {
  id: string;
  location: string;
  building: FantasyBuildingId;
  job: string;
  names: Record<NpcLocale, string>;
  race?: string;
  xp: number;
}

/** 町とNPCの初期化が循環しないよう、この台帳は実行時に両者を参照しない。 */
export const FANTASY_ARTISANS: FantasyArtisan[] = [
  { id: 'artisan-hearth-nella', location: 'hearth', building: 'restaurant', job: 'cook', names: { ko: '넬라', en: 'Nella', ja: 'ネラ' }, xp: 220 },
  { id: 'artisan-reedcross-pavel', location: 'reedcross', building: 'restaurant', job: 'baker', names: { ko: '파벨', en: 'Pavel', ja: 'パヴェル' }, xp: 180 },
  { id: 'artisan-emberhall-rurik', location: 'emberhall', building: 'guild', job: 'blacksmith', race: 'dwarf', names: { ko: '루리크', en: 'Rurik', ja: 'ルーリク' }, xp: 320 },
  { id: 'artisan-canopy-sylven', location: 'canopy-hall', building: 'guild', job: 'carpenter', names: { ko: '실벤', en: 'Sylven', ja: 'シルヴェン' }, xp: 260 },
  { id: 'artisan-inkstone-hyeon', location: 'inkstone-city', building: 'guild', job: 'scribe', names: { ko: '현', en: 'Hyeon', ja: 'ヒョン' }, xp: 240 },
  { id: 'artisan-suncourt-elodie', location: 'suncourt', building: 'merchantGuild', job: 'tailor', names: { ko: '엘로디', en: 'Elodie', ja: 'エロディ' }, xp: 280 },
  { id: 'artisan-loom-mairi', location: 'loom-village', building: 'merchantGuild', job: 'weaver', names: { ko: '마이리', en: 'Mairi', ja: 'マイリ' }, xp: 300 },
  { id: 'artisan-redweave-nadir', location: 'redweave', building: 'merchantGuild', job: 'leatherworker', names: { ko: '나디르', en: 'Nadir', ja: 'ナディル' }, xp: 260 },
  { id: 'artisan-emberhall-briska', location: 'emberhall', building: 'merchantGuild', job: 'gemcutter', race: 'dwarf', names: { ko: '브리스카', en: 'Briska', ja: 'ブリスカ' }, xp: 340 },
  { id: 'artisan-sunloom-tala', location: 'sunloom', building: 'merchantGuild', job: 'potter', names: { ko: '탈라', en: 'Tala', ja: 'タラ' }, xp: 210 },
  { id: 'artisan-mossbrook-enna', location: 'mossbrook', building: 'market', job: 'herbalist', names: { ko: '엔나', en: 'Enna', ja: 'エンナ' }, xp: 230 },
  { id: 'artisan-wellrest-omri', location: 'wellrest', building: 'market', job: 'farmer', names: { ko: '옴리', en: 'Omri', ja: 'オムリ' }, xp: 190 },
  { id: 'artisan-tidehaven-petra', location: 'tidehaven', building: 'market', job: 'fisher', names: { ko: '페트라', en: 'Petra', ja: 'ペトラ' }, xp: 250 },
  { id: 'artisan-saffron-yasmin', location: 'saffron-port', building: 'market', job: 'merchant', names: { ko: '야스민', en: 'Yasmin', ja: 'ヤスミン' }, xp: 300 },
  { id: 'artisan-verdant-ilmar', location: 'verdant-quay', building: 'shipyard', job: 'shipwright', names: { ko: '일마르', en: 'Ilmar', ja: 'イルマル' }, xp: 360 },
  { id: 'artisan-mooncity-serit', location: 'mooncity', building: 'tower', job: 'alchemist', names: { ko: '세리트', en: 'Serit', ja: 'セリト' }, xp: 330 },
  { id: 'artisan-pinewatch-brann', location: 'pinewatch', building: 'tower', job: 'alchemist', names: { ko: '브란', en: 'Brann', ja: 'ブラン' }, xp: 180 },
  { id: 'artisan-mossbrook-rivet', location: 'mossbrook', building: 'tower', job: 'alchemist', names: { ko: '리베트', en: 'Rivet', ja: 'リヴェト' }, xp: 210 },
  { id: 'artisan-sunloom-dima', location: 'sunloom', building: 'tower', job: 'alchemist', names: { ko: '디마', en: 'Dima', ja: 'ディマ' }, xp: 250 },
  { id: 'artisan-saffron-fadila', location: 'saffron-port', building: 'tower', job: 'alchemist', names: { ko: '파딜라', en: 'Fadila', ja: 'ファディラ' }, xp: 290 },
  { id: 'artisan-rockshade-olek', location: 'rockshade', building: 'guild', job: 'blacksmith', race: 'dwarf', names: { ko: '올레크', en: 'Olek', ja: 'オレク' }, xp: 220 },
];

export function fantasyArtisansAt(c: Pick<FantasyCharacter, 'location'>): FantasyArtisan[] {
  return FANTASY_ARTISANS.filter(artisan => artisan.location === c.location).map(artisan => ({ ...artisan, names: { ...artisan.names } }));
}
