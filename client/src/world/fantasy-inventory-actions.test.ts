import test from 'node:test';
import assert from 'node:assert/strict';
import { FANTASY_ITEMS } from '../../../shared/fantasy-data.ts';
import { fantasyInventoryUseLabel } from './fantasy-inventory-actions.ts';

test('inventory actions consistently name eating, drinking and other use in each locale', () => {
  const examples = [
    ['bread', ['먹기', 'Eat', '食べる']],
    ['potion', ['마시기', 'Drink', '飲む']],
    ['antidote', ['마시기', 'Drink', '飲む']],
    ['herb', ['사용', 'Use', '使う']],
  ] as const;
  for (const [id, labels] of examples) for (const [index, locale] of (['ko', 'en', 'ja'] as const).entries()) {
    assert.equal(fantasyInventoryUseLabel(id, FANTASY_ITEMS.find(item => item.id === id), locale), labels[index]);
  }
  const item = { id: 'new-tonic', name: 'Tonic', price: 1, description: '', category: 'potion' };
  assert.equal(fantasyInventoryUseLabel(item.id, item, 'en'), 'Drink');
  assert.equal(fantasyInventoryUseLabel('map-ridge', undefined, 'en'), 'Use');
});
