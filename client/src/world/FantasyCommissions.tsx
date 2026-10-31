import { useState } from 'react';
import type { FantasyAction, FantasyCharacter } from '../../../shared/fantasy.ts';
import { FANTASY_ITEMS, FANTASY_JOBS, FANTASY_RECIPES } from '../../../shared/fantasy-data.ts';
import { fantasyArtisansAt, type FantasyArtisan } from '../../../shared/fantasy-artisan-catalog.ts';
import { fantasyCommissionRecipeAllowed, fantasyCommissionText, quoteFantasyCommission } from '../../../shared/fantasy-commissions.ts';
import type { FantasyBuildingId } from '../../../shared/fantasy-town.ts';
import { useLocale } from '../locale.ts';
import { ReasonButton } from './FantasyActionButton.tsx';
import { realDuration } from './FantasyActivity.tsx';
import { itemDisplayName } from './fantasy-action-help.ts';

type Props = { c: FantasyCharacter; building: FantasyBuildingId; blocked: boolean; onAction: (action: FantasyAction) => void };
const MATERIAL_CATEGORIES = new Set(['ore', 'ingot', 'wood', 'hide', 'cloth', 'silk']);

function ArtisanCommission({ c, artisan, blocked, onAction }: Omit<Props, 'building'> & { artisan: FantasyArtisan }) {
  const [locale] = useLocale();
  const recipes = FANTASY_RECIPES.filter(recipe => recipe.job === artisan.job && fantasyCommissionRecipeAllowed(recipe));
  const [recipeId, setRecipeId] = useState(recipes[0]?.id ?? '');
  const [material, setMaterial] = useState(''), [gem, setGem] = useState('');
  const recipe = recipes.find(recipe => recipe.id === recipeId) ?? recipes[0];
  const job = FANTASY_JOBS.find(job => job.id === artisan.job);
  const t = {
    ko: { recipe: '제작품', material: '선택 소재', base: '기본 재료', gem: '선택 보석', none: '추가하지 않음', supplies: '내가 제공할 재료', fee: '수수료', time: '소요 시간', order: '제작 의뢰', trading: '이 상인은 물품 거래를 안내합니다.' },
    en: { recipe: 'Finished goods', material: 'Material substitution', base: 'Original materials', gem: 'Optional gem', none: 'None', supplies: 'Materials you provide', fee: 'Fee', time: 'Duration', order: 'Commission', trading: 'This merchant advises on trading goods.' },
    ja: { recipe: '制作する品', material: '素材の置き換え', base: '元の材料', gem: '追加する宝石', none: '追加しない', supplies: '提供する材料', fee: '手数料', time: '所要時間', order: '制作を依頼', trading: 'この商人は品物の取引を案内します。' },
  }[locale];
  const title = <>{artisan.names[locale]} · {job?.names[locale]}</>;
  if (!recipe) return <p className="fr-muted">{title}<br/>{t.trading}</p>;
  const request = { recipe: recipe.id, npcId: artisan.id, ...(material ? { material } : {}), ...(gem ? { gem } : {}) };
  const quote = quoteFantasyCommission(c, request);
  const output = FANTASY_ITEMS.find(item => item.id === recipe.output);
  const categories = new Set(Object.keys(recipe.inputs).map(id => FANTASY_ITEMS.find(item => item.id === id)?.category).filter(category => category && MATERIAL_CATEGORIES.has(category)));
  const materials = FANTASY_ITEMS.filter(item => categories.has(item.category) && (c.inventory[item.id] ?? 0) > 0);
  const gems = FANTASY_ITEMS.filter(item => item.category === 'gem' && (c.inventory[item.id] ?? 0) > 0);
  const error = quote.error ? fantasyCommissionText(quote.error, locale) ?? quote.error : undefined;
  const name = (id: string) => itemDisplayName(id, locale);
  return <details className="fr-fold" data-commission-artisan={artisan.id}>
    <summary>{title}</summary>
    <fieldset disabled={blocked} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      <label style={{ display: 'grid', gap: 4, marginBottom: 12 }}>{t.recipe}
        <select value={recipe.id} onChange={event => { setRecipeId(event.target.value); setMaterial(''); setGem(''); }} style={{ minHeight: 44, maxWidth: '100%', font: 'inherit' }}>
          {recipes.map(recipe => <option key={recipe.id} value={recipe.id}>{name(recipe.output)}</option>)}
        </select>
      </label>
      {output?.equipment && <>
        <label style={{ display: 'grid', gap: 4, marginBottom: 12 }}>{t.material}<select value={material} onChange={event => setMaterial(event.target.value)} style={{ minHeight: 44, maxWidth: '100%', font: 'inherit' }}>
          <option value="">{t.base}</option>{materials.map(item => <option key={item.id} value={item.id}>{name(item.id)} × {c.inventory[item.id]}</option>)}
        </select></label>
        <label style={{ display: 'grid', gap: 4, marginBottom: 12 }}>{t.gem}<select value={gem} onChange={event => setGem(event.target.value)} style={{ minHeight: 44, maxWidth: '100%', font: 'inherit' }}>
          <option value="">{t.none}</option>{gems.map(item => <option key={item.id} value={item.id}>{name(item.id)} × {c.inventory[item.id]}</option>)}
        </select></label>
      </>}
      <p>{name(recipe.output)} × {quote.count || recipe.count}</p>
      <b>{t.supplies}</b>
      <ul>{Object.entries(quote.inputs).map(([id, count]) => <li key={id}>{name(id)} · {c.inventory[id] ?? 0} / {count}</li>)}</ul>
      <p>{t.fee}: {quote.fee} G · {t.time}: {quote.hours} h · {realDuration(quote.hours, locale)}</p>
      {error && <p role="status" className="fr-muted">{error}</p>}
      <ReasonButton type="button" className="fr-btn" disabled={blocked || !!error} reason={blocked ? undefined : error} onClick={() => onAction({ type: 'commission', ...request })}>{t.order} · {quote.fee} G</ReasonButton>
    </fieldset>
  </details>;
}

export function FantasyCommissions({ c, building, blocked, onAction }: Props) {
  const [locale] = useLocale();
  const artisans = fantasyArtisansAt(c).filter(artisan => artisan.building === building);
  if (!artisans.length) return null;
  return <section className="fr-commissions">
    <h3>{{ ko: '장인에게 제작 의뢰', en: 'Commission an artisan', ja: '職人に制作を依頼' }[locale]}</h3>
    <p className="fr-muted">{{ ko: '재료와 수수료를 제공하면 장인이 제작합니다.', en: 'Provide the materials and fee for the artisan to craft your goods.', ja: '材料と手数料を渡し、職人に品物の制作を頼みます。' }[locale]}</p>
    {artisans.map(artisan => <ArtisanCommission key={`${artisan.id}:${c.location}`} c={c} artisan={artisan} blocked={blocked} onAction={onAction}/>)}
  </section>;
}
