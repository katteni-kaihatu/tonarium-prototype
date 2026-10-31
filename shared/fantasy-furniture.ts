import type { FantasyItem, FantasyRecipe } from './fantasy.ts';
import type { NpcLocale } from './npc.ts';
type Text = Record<NpcLocale, string>;
const l = (ko: string, en: string, ja: string): Text => ({ ko, en, ja });
export interface FantasyFurniture { item: string; category: 'bed' | 'workbench' | 'chest' | 'table' | 'decoration' | 'desk' | 'drawers'; storage?: number; fatigue: number; names: Text; descriptions: Text }
export interface FantasyFurniturePlacement { item: string; user: string; generation: number; hour: number }
export const FANTASY_FURNITURE: FantasyFurniture[] = [
  { item: 'furniture-bed', category: 'bed', fatigue: 10, names: l('목제 침대', 'Wooden Bed', '木の寝台'), descriptions: l('집에서 숙면하면 피로를 10 더 줄인다. 침대는 집에 한 개만 놓을 수 있다.', 'A completed home rest reduces fatigue by 10 more. One bed per home.', '自宅で休み終えると疲労をさらに10減らす。寝台は一軒に1台。') },
  { item: 'furniture-fine-bed', category: 'bed', fatigue: 20, names: l('안락한 침대', 'Comfortable Bed', '安らぎの寝台'), descriptions: l('집에서 숙면하면 피로를 20 더 줄인다. 다른 침대와 중첩하지 않는다.', 'A completed home rest reduces fatigue by 20 more. Does not stack with another bed.', '自宅で休み終えると疲労をさらに20減らす。他の寝台と重ならない。') },
  { item: 'furniture-canopy-bed', category: 'bed', fatigue: 25, names: l('차양 침대', 'Canopy Bed', '天蓋の寝台'), descriptions: l('집에서 숙면하면 피로를 25 더 줄인다. 다른 침대와 중첩하지 않는다.', 'A completed home rest reduces fatigue by 25 more. Does not stack with another bed.', '自宅で休み終えると疲労をさらに25減らす。他の寝台と重ならない。') },
  { item: 'furniture-workbench', category: 'workbench', fatigue: 0, names: l('목제 작업대', 'Wooden Workbench', '木の作業台'), descriptions: l('집에 놓는 튼튼한 작업대. 집마다 하나만 설치한다.', 'A sturdy workbench for a home. Install one per home.', '自宅に置く丈夫な作業台。一軒に1台だけ置ける。') },
  { item: 'furniture-chest', category: 'chest', storage: 24_000, fatigue: 0, names: l('목제 궤', 'Wooden Chest', '木の長櫃'), descriptions: l('재료 24kg을 수납하는 나무 궤. 집마다 하나만 설치한다.', 'Stores 24 kg of materials. Install one per home.', '資材24kgを収納する木の長櫃。一軒に1個だけ置ける。') },
  { item: 'furniture-table', category: 'table', fatigue: 0, names: l('식탁', 'Dining Table', '食卓'), descriptions: l('집에 놓는 식탁. 집마다 하나만 설치한다.', 'A dining table for a home. Install one per home.', '自宅に置く食卓。一軒に1台だけ置ける。') },
  { item: 'furniture-carved-stool', category: 'decoration', fatigue: 0, names: l('조각 걸상', 'Carved Stool', '彫りの腰掛け'), descriptions: l('나뭇결을 살린 장식 걸상. 장식은 집마다 네 점까지 놓는다.', 'A decorative stool showing the grain. A home holds up to four decorative pieces.', '木目を生かした飾りの腰掛け。装飾は一軒に4点まで。') },
  { item: 'furniture-desk', category: 'desk', storage: 12_000, fatigue: 0, names: l('서랍 책상', 'Writing Desk', '引出し机'), descriptions: l('재료 수납 12kg과 2종을 더한다.', 'Adds 12 kg and two material slots.', '資材の収納を12kg、2品目増やす。') },
  { item: 'furniture-drawers', category: 'drawers', storage: 36_000, fatigue: 0, names: l('튼튼한 서랍장', 'Sturdy Drawers', '丈夫な引出し箪笥'), descriptions: l('재료 수납 36kg과 6종을 더한다.', 'Adds 36 kg and six material slots.', '資材の収納を36kg、6品目増やす。') },
];
export const fantasyFurniture = (item: string) => FANTASY_FURNITURE.find(furniture => furniture.item === item);
export const FANTASY_FURNITURE_ITEMS: FantasyItem[] = FANTASY_FURNITURE.map((furniture, index) => ({ id: furniture.item, names: furniture.names, name: furniture.names.ja, descriptions: furniture.descriptions, description: furniture.descriptions.ja, category: 'furniture', tier: index === 2 ? 3 : index === 1 ? 2 : 1, price: [70, 150, 250, 65, 55, 55, 25, 90, 130][index], sellJobs: ['carpenter'], buyJobs: ['carpenter'] }));
export const FANTASY_FURNITURE_RECIPES: FantasyRecipe[] = FANTASY_FURNITURE.map((furniture, index) => ({ id: `carpenter-${furniture.item}`, name: furniture.names.ja, job: 'carpenter', inputs: ([{ wood: 8, ore: 2 }, { wood: 12, ore: 3, silk: 2 }, { wood: 18, ore: 4, silk: 4 }, { wood: 7, ore: 2 }, { wood: 6, ore: 1 }, { wood: 6 }, { wood: 3 }, { wood: 9, ore: 1 }, { wood: 12, ore: 2 }] as Record<string, number>[])[index], output: furniture.item, count: 1, dc: [10, 14, 17, 11, 10, 10, 8, 11, 12][index] }));
export function fantasyFurnitureCanPlace(current: readonly Pick<FantasyFurniturePlacement, 'item'>[], item: string): boolean {
  const furniture = fantasyFurniture(item); if (!furniture) return false;
  const count = current.filter(placed => fantasyFurniture(placed.item)?.category === furniture.category).length;
  return count < (furniture.category === 'decoration' ? 4 : 1);
}
export function validFantasyFurniture(value: unknown): value is FantasyFurniturePlacement[] {
  if (!Array.isArray(value) || value.length > 10) return false;
  const placed: FantasyFurniturePlacement[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry) || Object.keys(entry).length !== 4 || Object.keys(entry).some(key => !['item', 'user', 'generation', 'hour'].includes(key))
      || typeof entry.item !== 'string' || !fantasyFurnitureCanPlace(placed, entry.item) || typeof entry.user !== 'string' || !entry.user.trim() || entry.user.length > 120 || !Number.isSafeInteger(entry.generation) || entry.generation < 1 || !Number.isFinite(entry.hour) || entry.hour < 0) return false;
    placed.push(entry);
  }
  return true;
}
export const fantasyFurnitureFatigueBonus = (placed: readonly FantasyFurniturePlacement[] = []) => Math.max(0, ...placed.map(entry => fantasyFurniture(entry.item)?.fatigue ?? 0));
