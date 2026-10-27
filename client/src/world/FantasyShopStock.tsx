import { useState } from 'react';
import type { FantasyAction, FantasyCharacter } from '../../../shared/fantasy.ts';
import { FANTASY_ITEMS } from '../../../shared/fantasy-data.ts';
import { FANTASY_MAPS } from '../../../shared/fantasy-town.ts';
import { fantasyPrice } from '../../../shared/fantasy-reputation.ts';
import { useLocale } from '../locale.ts';
import { ReasonButton } from './FantasyActionButton.tsx';
import { itemDisplayName } from './fantasy-action-help.ts';
import { foodMeta } from '../../../shared/fantasy-life.ts';

const groups = {
  travel: ['여행용품·복식', 'Travel gear and clothing', '旅道具・衣服'], food: ['음식·보존식', 'Food and provisions', '料理・保存食'], magic: ['마도구·마정석', 'Magic tools and crystals', '魔道具・魔晶石'], remedies: ['약초·물약', 'Herbs and potions', '薬草・薬'], equipment: ['무기·장비', 'Weapons and equipment', '武器・装備'], materials: ['제작 재료', 'Craft materials', '制作素材'], curios: ['소품·재미용품', 'Trinkets and curios', '小物・遊び道具'], maps: ['지역 지도', 'Local maps', '地域の地図'],
};
function group(id: string): keyof typeof groups {
  if (FANTASY_MAPS.some(map => map.item === id)) return 'maps';
  if (foodMeta(id)) return 'food';
  if (['potion', 'antidote'].includes(id)) return 'remedies';
  const category = FANTASY_ITEMS.find(item => item.id === id)?.category ?? '';
  return ['camp', 'tool', 'clothing'].includes(category) ? 'travel' : ['food', 'fish'].includes(category) ? 'food' : ['magic-tool', 'crystal'].includes(category) ? 'magic' : ['herb', 'potion', 'elixir'].includes(category) ? 'remedies' : ['weapon', 'armor', 'accessory'].includes(category) ? 'equipment' : category === 'curio' ? 'curios' : 'materials';
}

export function FantasyShopStock({ c, stock, hour, blocked, onAction }: { c: FantasyCharacter; stock: string[]; hour: number; blocked: boolean; onAction: (action: FantasyAction) => void }) {
  const [locale] = useLocale(), [query, setQuery] = useState(''), index = locale === 'ko' ? 0 : locale === 'en' ? 1 : 2;
  const name = (id: string) => FANTASY_MAPS.find(map => map.item === id)?.name[locale] ?? itemDisplayName(id, locale);
  const matches = stock.filter(id => name(id).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const label = { ko: '물건 찾기', en: 'Find goods', ja: '品物を探す' }[locale];
  return <><div className="fr-shop-filter"><input aria-label={label} placeholder={label} value={query} onChange={event => setQuery(event.target.value)}/></div>
    {(Object.keys(groups) as (keyof typeof groups)[]).map(key => {
      const items = matches.filter(id => group(id) === key);
      return !!items.length && <details className="fr-shop-group" key={key} open={!!query}><summary>{groups[key][index]} · {items.length}</summary>{items.map(id => {
        const base = FANTASY_MAPS.find(map => map.item === id)?.price ?? FANTASY_ITEMS.find(item => item.id === id)?.price ?? 0;
        const price = fantasyPrice({ ...c, hour }, base, 'goods');
        return <div className="fr-service-row" key={id}><span>{name(id)}</span><b>{price} G</b><ReasonButton className="fr-btn" disabled={blocked || c.gold < price} reason={blocked ? undefined : { ko: '소지금이 부족합니다.', en: 'Not enough gold.', ja: '所持金が足りません。' }[locale]} onClick={() => onAction({ type: 'buy', item: id })}>{{ ko: '구매', en: 'Buy', ja: '買う' }[locale]}</ReasonButton></div>;
      })}</details>;
    })}
    {!matches.length && <p>{{ ko: '일치하는 물건이 없습니다.', en: 'No matching goods.', ja: '該当する品物はありません。' }[locale]}</p>}
  </>;
}
