import type { FantasyLocation, FantasyProfile, FantasySeason, FantasyTravelPosition } from '../../../shared/fantasy.ts';
import { FANTASY_LOCATIONS, FANTASY_ROUTES } from '../../../shared/fantasy-data.ts';
import { fantasyEnvironment } from '../../../shared/fantasy-environment.ts';
import { fantasyTravelCurrentTransport, fantasyTravelPosition } from '../../../shared/fantasy-travel.ts';

export type FantasyTerrain = FantasyLocation['kind'] | 'sea';
export interface FantasyTerrainMood {
  location: string; terrain: FantasyTerrain; season: FantasySeason;
  weather: 'clear' | 'cloudy' | 'rain' | 'snow'; night: boolean; temperature: number;
}
export interface FantasyTerrainFrame {
  from: FantasyTerrainMood; to: FantasyTerrainMood; progress: number; tokens: Record<string, string>;
}
interface TerrainPalette { name: string; names: { ko: string; en: string; ja: string }; source: string; sourceColors: readonly string[]; colors: readonly string[] }
function rgb(hex: string) { return [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16)); }
function luminance(hex: string) {
  const [r, g, b] = rgb(hex).map(value => {
    const channel = value / 255;
    return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
  });
  return .2126 * r + .7152 * g + .0722 * b;
}
const palette = (name: string, ko: string, ja: string, colors: string): TerrainPalette => {
  const sourceColors = colors.split('-').map(color => `#${color}`);
  return { name, names: { ko, en: name, ja }, source: `https://coolors.co/palette/${colors}`, sourceColors, colors: sourceColors.filter(color => luminance(color) >= .45) };
};
export const FANTASY_TERRAIN_PALETTES: Record<FantasyTerrain, TerrainPalette> = {
  city: palette('Soft Sand', '부드러운 모래', '柔らかな砂', 'edede9-d6ccc2-f5ebe0-e3d5ca-d5bdaf'),
  forest: palette('Natural Harmony', '자연의 조화', '自然の調和', '75dbcd-c9dbba-dcdba8-f5cda7-faa381'),
  mountain: palette('Light Steel', '밝은 강철', '淡い鋼', 'f8f9fa-e9ecef-dee2e6-ced4da-adb5bd-6c757d-495057-343a40-212529'),
  cave: palette('Subtle Pastel Hues', '은은한 파스텔 색조', 'ほのかなパステルの色調', 'eae4e9-fff1e6-fde2e4-fad2e1-e2ece9-bee1e6-f0efeb-dfe7fd-cddafd'),
  ruin: palette('Golden Summer Fields', '금빛 여름 들판', '金色の夏の野原', 'ccd5ae-e9edc9-fefae0-faedcd-d4a373'),
  coast: palette('Pastel Fantasy', '파스텔 판타지', 'パステルファンタジー', '7bdff2-b2f7ef-eff7f6-f7d6e0-f2b5d4'),
  swamp: palette('Soft Serenity', '부드러운 고요', '柔らかな静けさ', 'e8d7ff-ffd3e8-ffd7d5-f3ffe1-dfffd6'),
  desert: palette('Soft Peachy Delight', '부드러운 복숭아빛 기쁨', '柔らかな桃色の喜び', 'fec5bb-fcd5ce-fae1dd-f8edeb-e8e8e4-d8e2dc-ece4db-ffe5d9-ffd7ba-fec89a'),
  volcano: palette('Pastel Bliss', '파스텔의 행복', 'パステルの幸せ', 'ffb5a7-fcd5ce-f8edeb-f9dcc4-fec89a'),
  island: palette('Pastel Dreams', '파스텔의 꿈', 'パステルの夢', 'ff99c8-fcf6bd-d0f4de-a9def9-e4c1f9'),
  tower: palette('Pastel Dreamland Adventure', '파스텔 꿈나라 모험', 'パステルの夢の国の冒険', 'cdb4db-ffc8dd-ffafcc-bde0fe-a2d2ff'),
  snow: palette('Blue Serenity', '푸른 고요', '青い静けさ', 'edf2fb-e2eafc-d7e3fc-ccdbfd-c1d3fe-b6ccfe-abc4ff'),
  sea: palette('Ocean Blue Serenity', '푸른 바다의 고요', '青い海の静けさ', '03045e-023e8a-0077b6-0096c7-00b4d8-48cae4-90e0ef-ade8f4-caf0f8'),
};

const places = new Map(FANTASY_LOCATIONS.map(place => [place.id, place]));
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const mix = (from: string, to: string, fraction: number) => {
  const a = rgb(from), b = rgb(to);
  return `#${a.map((value, index) => Math.round(value + (b[index] - value) * clamp(fraction)).toString(16).padStart(2, '0')).join('')}`;
};
export function fantasyTerrainContrast(aHex: string, bHex: string): number {
  const a = luminance(aHex), b = luminance(bHex);
  return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
}
const readableShade = (foreground: string, backgrounds: string[], toward: string) => {
  if (backgrounds.every(background => fantasyTerrainContrast(foreground, background) >= 4.6)) return foreground;
  let low = 0, high = 1;
  for (let index = 0; index < 12; index++) {
    const middle = (low + high) / 2, candidate = mix(foreground, toward, middle);
    if (backgrounds.every(background => fantasyTerrainContrast(candidate, background) >= 4.6)) high = middle;
    else low = middle;
  }
  return mix(foreground, toward, high);
};
const anchors: Record<FantasyTerrain, number> = {
  city: 3, forest: 0, mountain: 3, cave: 5, ruin: 0, coast: 0, swamp: 4,
  desert: 9, volcano: 0, island: 2, tower: 0, snow: 6, sea: 0,
};
function terrainTokens(mood: FantasyTerrainMood): Record<string, string> {
  const colors = FANTASY_TERRAIN_PALETTES[mood.terrain].colors;
  const sorted = [...colors].sort((a, b) => luminance(a) - luminance(b));
  const darkest = sorted[0], lightest = sorted.at(-1)!;
  const warmest = [...colors].sort((a, b) => {
    const warmth = (hex: string) => { const [r, g, blue] = rgb(hex); return r - (g + blue) / 2; };
    return warmth(b) - warmth(a);
  })[0];
  let accent = colors[anchors[mood.terrain]];
  if (mood.season === 'spring') accent = mix(accent, lightest, .08);
  if (mood.season === 'summer') accent = mix(accent, darkest, .08);
  if (mood.season === 'autumn') accent = mix(accent, warmest, mood.terrain === 'forest' ? .92 : .35);
  if (mood.season === 'winter') accent = mix(mix(accent, lightest, mood.terrain === 'forest' ? .75 : .3), '#ffffff', .12);
  accent = mix(accent, '#ffffff', .24);
  const frost = mood.season === 'winter' ? .04 : 0;
  return {
    '--fr-paper': mix(accent, '#ffffff', .68 + frost),
    '--fr-surface': mix(accent, '#ffffff', .82),
    '--fr-surface-alt': mix(accent, '#ffffff', .5 + frost),
    '--fr-ink': '#383838',
    '--fr-muted': '#626262',
    '--fr-accent': accent,
    '--fr-accent-ink': '#424242',
    '--fr-border': mix(accent, '#ffffff', .45),
    '--fr-character-bg': mix(accent, '#ffffff', .16),
    '--fr-character-ink': '#3f3f3f',
    '--fr-character-muted': '#606060',
    '--fr-gold': mix(mix(warmest, lightest, .18), '#ffffff', .42),
    '--fr-shadow': mix(accent, '#ffffff', .5),
  };
}
function frame(from: FantasyTerrainMood, to = from, progress = 0): FantasyTerrainFrame {
  const start = terrainTokens(from), end = terrainTokens(to);
  const tokens = Object.fromEntries(Object.keys(start).map(key => [key, mix(start[key], end[key], progress)]));
  const surfaces = ['--fr-paper', '--fr-surface', '--fr-surface-alt'].map(key => tokens[key]);
  for (const key of ['--fr-ink', '--fr-muted']) tokens[key] = readableShade(tokens[key], surfaces, '#000000');
  tokens['--fr-accent-ink'] = readableShade(tokens['--fr-accent-ink'], [tokens['--fr-accent']], '#000000');
  for (const key of ['--fr-character-ink', '--fr-character-muted']) {
    tokens[key] = readableShade(tokens[key], [tokens['--fr-character-bg']], '#000000');
  }
  return { from, to, progress, tokens };
}
function mood(location: string, hour: number, terrain?: FantasyTerrain): FantasyTerrainMood {
  const place = places.get(location) ?? places.get('hearth')!;
  const { season, weather, night, temperature } = fantasyEnvironment({ location: place.id, hour });
  return { location: place.id, terrain: terrain ?? place.kind, season, weather, night, temperature };
}
function usablePosition(position: FantasyTravelPosition | undefined): position is FantasyTravelPosition {
  return !!position && places.has(position.from) && places.has(position.to)
    && Number.isFinite(position.fraction) && position.fraction >= 0 && position.fraction <= 1;
}
function legacyPosition(profile: FantasyProfile, hour: number, path?: readonly string[]): FantasyTravelPosition | undefined {
  const activity = profile.activity!, character = profile.character!;
  if (activity.action.type !== 'travel') return undefined;
  const ids = path?.length && path[0] === character.location && path.at(-1) === activity.action.destination
    ? path : [character.location, activity.action.destination];
  if (ids.length < 2 || ids.some(id => !places.has(id))) return undefined;
  const duration = activity.endsAt - activity.startedAt;
  if (!(duration > 0) || !Number.isFinite(duration)) return undefined;
  const progress = clamp((hour - activity.startedAt) / duration);
  if (progress >= 1) return { from: ids.at(-1)!, to: ids.at(-1)!, fraction: 0 };
  const lengths = ids.slice(1).map((id, index) => {
    const from = places.get(ids[index])!, to = places.get(id)!;
    return Math.hypot(to.x - from.x, to.y - from.y);
  });
  let distance = lengths.reduce((sum, length) => sum + length, 0) * progress;
  for (const [index, length] of lengths.entries()) {
    if (distance < length || index === lengths.length - 1) return { from: ids[index], to: ids[index + 1], fraction: length ? distance / length : 0 };
    distance -= length;
  }
  return undefined;
}
export function fantasyTerrainFrame(profile: FantasyProfile | undefined, hour?: number, path?: readonly string[]): FantasyTerrainFrame {
  const character = profile?.character;
  if (!character) return frame(mood('hearth', 12));
  const currentHour = Math.max(0, Number.isFinite(hour) ? hour! : Number.isFinite(character.hour) ? character.hour : 12);
  const activity = profile!.activity;
  const travelling = activity?.action.type === 'travel';
  const scheduled = travelling && activity.travel?.legs.length && Number.isFinite(activity.startedAt) && Number.isFinite(activity.endsAt)
    && activity.travel.legs.every(leg => Number.isFinite(leg.hours) && leg.hours > 0 && (leg.startFraction === undefined || Number.isFinite(leg.startFraction)))
    ? fantasyTravelPosition(activity, currentHour) : undefined;
  const position = scheduled ?? (travelling ? legacyPosition(profile!, currentHour, path) : character.travelPosition);
  if (!usablePosition(position)) return frame(mood(character.location, currentHour));
  const { from, to, fraction } = position;
  if (from === to || fraction <= 0) return frame(mood(from, currentHour));
  if (fraction >= 1) return frame(mood(to, currentHour));
  const transport = travelling ? fantasyTravelCurrentTransport(activity, currentHour) : undefined;
  const sea = (!transport || transport === 'ship' || transport === 'working-ship')
    && FANTASY_ROUTES.some(route => route.mode === 'sea' && (route.from === from && route.to === to || route.from === to && route.to === from));
  if (sea) {
    // 沖では岸の配色を残さず、接岸区間だけ隣り合う二色調を補間する。
    if (fraction < .18) return frame(mood(from, currentHour), mood(from, currentHour, 'sea'), fraction / .18);
    if (fraction > .82) return frame(mood(to, currentHour, 'sea'), mood(to, currentHour), (fraction - .82) / .18);
    return frame(mood(from, currentHour, 'sea'));
  }
  return frame(mood(from, currentHour), mood(to, currentHour), fraction);
}
