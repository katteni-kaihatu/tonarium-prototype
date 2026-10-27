import type { FantasyRace } from './fantasy.ts';

export const FANTASY_STARTING_GOLD = 35;
export const FANTASY_STARTING_INVENTORY: Readonly<Record<string, number>> = Object.freeze({ herb: 2, ore: 2, wood: 2, meal: 1, lantern: 1 });
export const FANTASY_RACIAL_GIFT_CHANCE = 0.35;
export const FANTASY_RANDOM_GIFT_CHANCE = 0.20;
/** Ordinary supplies only: no maps, exclusive quest items or unique equipment. */
export const FANTASY_RANDOM_GIFT_ITEMS: readonly string[] = Object.freeze(['herb', 'ore', 'wood', 'fish', 'meat', 'bread', 'jerky', 'meal', 'spice', 'potion']);
export const FANTASY_RACIAL_GIFT_ITEMS: Readonly<Record<string, string>> = Object.freeze({
  human: 'bread', elf: 'herb', dwarf: 'ore', orc: 'meat', halfling: 'meal', foxkin: 'spice', tideborn: 'fish', dragonblood: 'ore',
  starfairy: 'crystal', dryad: 'herb', stoneborn: 'ore', moonshadow: 'crystal', wolfkin: 'meat', catkin: 'fish', rabbitkin: 'herb', bearkin: 'meat',
  birdkin: 'jerky', lizardkin: 'spice', 'high-elf': 'crystal', 'dark-elf': 'crystal', 'snow-elf': 'jerky', 'hill-dwarf': 'wood', 'deep-dwarf': 'ore',
  'vampire-night': 'potion', 'vampire-crimson': 'potion', 'vampire-moon': 'crystal', 'frost-dragonkin': 'ore', 'storm-dragonkin': 'crystal',
  'fire-spirit': 'wood', 'water-spirit': 'fish', 'flower-fairy': 'herb', 'clockwork-golem': 'ore', gnome: 'wood', goblin: 'spice', hobgoblin: 'jerky',
  coralborn: 'fish', celestial: 'herb', devilkin: 'spice', revenant: 'crystal', demigod: 'potion', 'true-dragon': 'ore', 'elder-dragon': 'crystal',
  archangel: 'potion', archdemon: 'spice', phoenix: 'wood', voidborn: 'crystal',
  deerkin: 'herb', goatkin: 'jerky', batkin: 'fish', windspirit: 'crystal', frostfairy: 'herb',
});
export const FANTASY_FAMILY_GIFT_ITEMS: Readonly<Record<string, string>> = Object.freeze({
  human: 'bread', beastfolk: 'jerky', elf: 'herb', dwarf: 'ore', vampire: 'potion', dragonkin: 'ore', spirit: 'crystal', fairy: 'herb',
  golem: 'ore', smallfolk: 'meal', orcfolk: 'meat', seafolk: 'fish', otherworld: 'crystal', nightfolk: 'crystal', divine: 'potion',
});

const roll = (rng: () => number) => Math.max(0, Math.min(1 - Number.EPSILON, Number(rng()) || 0));

/** Called only after character creation has passed validation. Every call returns a fresh inventory. */
export function fantasyStartingInventory(race: Pick<FantasyRace, 'id' | 'family'>, rng: () => number = Math.random): Record<string, number> {
  const inventory = { ...FANTASY_STARTING_INVENTORY };
  const add = (item: string) => { inventory[item] = (inventory[item] ?? 0) + 1; };
  const related = Object.hasOwn(FANTASY_RACIAL_GIFT_ITEMS, race.id) ? FANTASY_RACIAL_GIFT_ITEMS[race.id]
    : Object.hasOwn(FANTASY_FAMILY_GIFT_ITEMS, race.family) ? FANTASY_FAMILY_GIFT_ITEMS[race.family] : 'bread';
  if (roll(rng) < FANTASY_RACIAL_GIFT_CHANCE) add(related);
  if (roll(rng) < FANTASY_RANDOM_GIFT_CHANCE) add(FANTASY_RANDOM_GIFT_ITEMS[Math.floor(roll(rng) * FANTASY_RANDOM_GIFT_ITEMS.length)]);
  return inventory;
}
