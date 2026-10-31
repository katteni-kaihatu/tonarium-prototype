import { FANTASY_ITEMS, FANTASY_LOCATIONS } from './fantasy-data.ts';
import { fantasyEnvironment } from './fantasy-environment.ts';
import { FANTASY_SETTLEMENTS } from './fantasy-town.ts';
import { foodMeta } from './fantasy-life.ts';
import type { FantasySeason } from './fantasy.ts';

type Text = Record<'ko' | 'en' | 'ja', string>;
const l = (ko: string, en: string, ja: string): Text => ({ ko, en, ja });
export type FantasyProductDemandTag = 'warmth' | 'preserved' | 'drink' | 'light-cloth' | 'ship' | 'net' | 'fuel' | 'woodwork' | 'hunting' | 'tool' | 'metal' | 'water' | 'tea';
export interface FantasyBusinessDemand { item: string; season: FantasySeason; open: boolean; level: 'low' | 'normal' | 'high'; quantity: number; baseQuantity: number; percent: number; reasons: Text[] }
export function fantasyProductDemandTags(item: string): FantasyProductDemandTag[] {
  const value = FANTASY_ITEMS.find(v => v.id === item), category = value?.category ?? '', result = new Set<FantasyProductDemandTag>();
  const add = (tag: FantasyProductDemandTag, yes: boolean) => { if (yes) result.add(tag); };
  add('warmth', (value?.wear?.warmth ?? 0) > 0 || /warm|quilt|coat|fur|wool|winter|frost.*cloth/.test(item));
  add('preserved', (foodMeta(item)?.shelfLife ?? 0) >= 72 || /jerky|preserv|dried|travel-loaf|ration/.test(item));
  add('drink', /drink|juice|tea|water|brew|tonic/.test(item));
  add('light-cloth', (value?.wear?.cooling ?? 0) > 0 || /linen|silk|sash|light.*cloth|summer|cotton/.test(item));
  add('ship', /ship|boat|sail|timber|hull|mast|rope/.test(item) || category === 'ship-material');
  add('net', /net|fishing|tackle/.test(item));
  add('fuel', /wood|coal|charcoal|fuel|resin/.test(item));
  add('woodwork', /wood|plank|timber|furniture|carved|stool/.test(item));
  add('hunting', /bow|arrow|hide|leather|trap|hunting/.test(item));
  add('tool', category === 'tool' || /tool|pickaxe|hammer|knife|chisel|saw/.test(item));
  add('metal', /ore|ingot|steel|iron|copper|tin|bronze|silver/.test(item) || category === 'ingot');
  add('water', /water|flask|waterskin|canteen/.test(item));
  add('tea', /tea|mint|moonmint/.test(item));
  return [...result];
}
export function fantasyBusinessDemand(location: string, item: string, at: number, baseQuantity = 1, operatingAt = at): FantasyBusinessDemand {
  const place = FANTASY_LOCATIONS.find(p => p.id === location), settlement = FANTASY_SETTLEMENTS[location], season = fantasyEnvironment({ location, hour: at }).season;
  const tags = fantasyProductDemandTags(item), has = (...values: FantasyProductDemandTag[]) => values.some(v => tags.includes(v));
  let percent = 85; const reasons: Text[] = [];
  if (season === 'winter' && has('warmth', 'preserved', 'fuel')) { percent += 85; reasons.push(l('겨울에는 보온·연료·보존식 수요가 큽니다.', 'Winter raises demand for warmth, fuel and preserved food.', '冬は防寒・燃料・保存食の需要が増えます。')); }
  if (season === 'summer' && has('drink', 'tea', 'water', 'light-cloth')) { percent += 85; reasons.push(l('여름에는 음료·차·물과 가벼운 옷감을 찾습니다.', 'Summer increases demand for drinks, tea, water and light cloth.', '夏は飲料・茶・水・軽い布が求められます。')); }
  if (season === 'summer' && has('warmth') && !has('light-cloth')) { percent -= 55; reasons.push(l('더운 계절에는 방한복 판매가 느립니다.', 'Warm weather slows winter-clothing sales.', '暑い季節は防寒着の売れ行きが鈍ります。')); }
  if (season === 'winter' && has('light-cloth') && !has('warmth')) { percent -= 40; reasons.push(l('겨울에는 얇은 직물의 판매가 느립니다.', 'Winter slows sales of thin textiles.', '冬は薄手の織物の売れ行きが鈍ります。')); }
  if (season === 'spring' && has('tool', 'woodwork')) { percent += 25; reasons.push(l('봄의 보수·개간 작업이 공구와 목제품 수요를 늘립니다.', 'Spring repairs and land work increase tool and woodwork demand.', '春の修繕・開墾で道具と木製品の需要が増えます。')); }
  if (season === 'autumn' && has('preserved', 'fuel')) { percent += 35; reasons.push(l('가을에는 겨울을 대비한 비축 수요가 있습니다.', 'Autumn brings demand for winter provisions.', '秋は冬に備える備蓄の需要があります。')); }
  const port = settlement?.kind === 'port' || !!place?.services.includes('port');
  const snow = place?.kind === 'snow' || ['mooncity', 'pinewatch'].includes(location);
  const forest = place?.kind === 'forest' || place?.land === 'sylvara' || ['pinewatch', 'leafshade', 'mossbrook'].includes(location);
  const mining = ['emberhall', 'ironridge'].includes(location) || place?.kind === 'mountain' || !!place?.resources.includes('ore') && settlement?.kind === 'city';
  const desert = place?.kind === 'desert' || place?.land === 'kazaran';
  if (port && has('ship', 'net', 'preserved')) { percent += 60; reasons.push(l('항구에서는 선박 자재·어망·보존식이 잘 팔립니다.', 'Ports buy ship supplies, nets and preserved food.', '港では船材・網・保存食がよく売れます。')); }
  if (snow && has('warmth', 'fuel')) { percent += 65; reasons.push(l('설원으로 통하는 지역은 보온품과 연료를 찾습니다.', 'Snow-country routes need warm goods and fuel.', '雪国への街道では防寒品と燃料が必要です。')); }
  if (forest && has('woodwork', 'hunting')) { percent += 45; reasons.push(l('숲의 생활과 수렵이 목제품·사냥 용품 수요를 늘립니다.', 'Forest trades and hunting increase woodwork and hunting-supply demand.', '森の暮らしと狩猟で木製品・狩猟用品が求められます。')); }
  if (mining && has('tool', 'metal')) { percent += 60; reasons.push(l('광산·공방 지역은 공구와 금속을 소비합니다.', 'Mining and workshop towns consume tools and metals.', '鉱山・工房の地域では工具と金属を消費します。')); }
  if (desert && has('water', 'tea', 'drink')) { percent += 70; reasons.push(l('건조한 지역에서는 물과 차의 수요가 큽니다.', 'Dry regions have strong demand for water and tea.', '乾いた地域では水と茶の需要が高いです。')); }
  if (!reasons.length) reasons.push(l('이 상품은 현재 계절·지역의 특별 수요가 없습니다.', 'This product has ordinary seasonal and local demand.', 'この品物には今の季節・地域の特別な需要はありません。'));
  percent = Math.min(300, Math.max(20, percent));
  const base = Math.min(99, Math.max(1, Math.floor(baseQuantity))), shift = Math.floor(Math.max(0, at) / 4);
  // 同じ世界時間の枠なら再接続や照会回数に関係なく同じ客数になる。
  const clock = ((operatingAt % 24) + 24) % 24, open = clock >= 6 && clock < 18;
  if (!open) reasons.unshift(l('밤에는 상점이 문을 닫아 판매하지 않습니다.', 'The shop closes at night; no goods are sold.', '夜は店が閉まり、販売しません。'));
  const quantity = !open ? 0 : Math.floor((shift + 1) * base * percent / 100) - Math.floor(shift * base * percent / 100);
  return { item, season, open, level: percent < 70 ? 'low' : percent > 120 ? 'high' : 'normal', quantity, baseQuantity: base, percent: open ? percent : 0, reasons };
}
