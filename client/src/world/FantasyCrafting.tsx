import { foodMeta } from '../../../shared/fantasy-life.ts';
import { fantasyLifeJob } from '../../../shared/fantasy-careers.ts';
import { ReasonButton } from './FantasyActionButton.tsx';
import { useEffect, useState } from 'react';
import type { FantasyAction, FantasyCharacter, FantasyRecipe } from '../../../shared/fantasy.ts';
import { FANTASY_ITEMS, FANTASY_JOBS, FANTASY_RECIPES } from '../../../shared/fantasy-data.ts';
import { fantasyCraftInputs } from '../../../shared/fantasy-equipment.ts';
import { fantasyBuildings, fantasyCanCraft, fantasyCraftFacility, type FantasyBuildingId } from '../../../shared/fantasy-town.ts';
import { fantasyProfessionGrade } from '../../../shared/fantasy-progression.ts';
import { FANTASY_JOB_GRADES } from '../../../shared/fantasy-skill-expansion.ts';
import { useLocale } from '../locale.ts';
import { realDuration } from './FantasyActivity.tsx';
import { itemDisplayName } from './fantasy-action-help.ts';
import { FantasyInteriorMapSurvey } from './FantasyInteriorMaps.tsx';
import { FantasyCooking } from './FantasyCooking.tsx';

type Props = { c: FantasyCharacter; building: FantasyBuildingId | string; onAction: (action: FantasyAction) => void; blocked: boolean; propertyWorkshop?: boolean; workshop?: string };
type RecipeProps = Omit<Props, 'building'> & { recipe: FantasyRecipe };
const MATERIAL_CATEGORIES = new Set(['ore', 'ingot', 'wood', 'hide', 'cloth', 'silk']);

function CraftRecipe({ c, recipe, onAction, blocked, workshop }: RecipeProps) {
  const [locale] = useLocale();
  const [material, setMaterial] = useState('');
  const [gem, setGem] = useState('');
  const t = {
    ko: { craft: '제작', materials: '소모 재료', substitute: '선택 소재', base: '기본 재료', gem: '선택 보석', none: '추가하지 않음', lack: '재료가 부족합니다.', invalid: '이 제작법에 사용할 수 없는 소재입니다.', equipmentOnly: '소재와 보석 선택은 장비 제작에서 사용할 수 있습니다.', gemInvalid: '사용 가능한 보석을 선택하세요.', unknown: '기록할 지역을 먼저 방문하거나 지도에 기록해야 합니다.' },
    en: { craft: 'Craft', materials: 'Materials consumed', substitute: 'Material substitution', base: 'Original materials', gem: 'Optional gem', none: 'None', lack: 'Not enough materials.', invalid: 'That material cannot replace an ingredient in this recipe.', equipmentOnly: 'Material and gem choices apply to equipment crafting.', gemInvalid: 'Choose a suitable gem.', unknown: 'Visit or chart the regions before copying this map.' },
    ja: { craft: '制作', materials: '消費する材料', substitute: '素材の置き換え', base: '元の材料', gem: '追加する宝石', none: '追加しない', lack: '材料が足りません。', invalid: 'この製法では指定した素材に置き換えられません。', equipmentOnly: '素材や宝石の追加指定は装備の制作で使います。', gemInvalid: '装備に使える宝石を選んでください。', unknown: '写図に記す地域を先に訪問するか、地図に記録してください。' },
  }[locale];
  const name = (id: string) => itemDisplayName(id, locale);
  const output = FANTASY_ITEMS.find(item => item.id === recipe.output);
  const categories = new Set(Object.keys(recipe.inputs).map(id => FANTASY_ITEMS.find(item => item.id === id)?.category).filter(category => category && MATERIAL_CATEGORIES.has(category)));
  const materials = output?.equipment ? FANTASY_ITEMS.filter(item => (c.inventory[item.id] ?? 0) > 0 && categories.has(item.category)) : [];
  const gems = output?.equipment ? FANTASY_ITEMS.filter(item => item.category === 'gem' && (c.inventory[item.id] ?? 0) > 0) : [];
  useEffect(() => { if (material && !materials.some(item => item.id === material)) setMaterial(''); }, [material, materials]);
  useEffect(() => { if (gem && !gems.some(item => item.id === gem)) setGem(''); }, [gem, gems]);
  const supplies = fantasyCraftInputs(c, recipe, material || undefined, gem || undefined);
  const permitted = fantasyCanCraft(c, recipe, !!workshop);
  const error = !permitted ? t.unknown : supplies.error ? ({
    '材料が足りません。': t.lack,
    'この製法では指定した素材に置き換えられません。': t.invalid,
    '素材や宝石の追加指定は装備の制作で使います。': t.equipmentOnly,
    '装備に使える登録済みの宝石を選んでください。': t.gemInvalid,
  }[supplies.error] ?? supplies.error) : '';
  return <details className="fr-craft-recipe" style={{ borderBottom: '1px solid #d8d9bd', padding: '10px 0' }}>
    <summary style={{ cursor: 'pointer', fontSize: 13 }}>{name(recipe.output)} × {supplies.count}</summary>
    <fieldset disabled={blocked} style={{ border: 0, padding: '10px 0 0', margin: 0, minWidth: 0 }}>
      {materials.length > 0 && <label style={{ display: 'grid', gap: 4, marginBottom: 10 }}>{t.substitute}<select value={material} onChange={event => setMaterial(event.target.value)} style={{ width: '100%', minWidth: 0, padding: 7, font: 'inherit' }}><option value="">{t.base}</option>{materials.map(item => <option key={item.id} value={item.id}>{name(item.id)} × {c.inventory[item.id]}</option>)}</select></label>}
      {output?.equipment && <label style={{ display: 'grid', gap: 4, marginBottom: 10 }}>{t.gem}<select value={gem} onChange={event => setGem(event.target.value)} style={{ width: '100%', minWidth: 0, padding: 7, font: 'inherit' }}><option value="">{t.none}</option>{gems.map(item => <option key={item.id} value={item.id}>{name(item.id)} × {c.inventory[item.id]}</option>)}</select></label>}
      <b style={{ fontSize: 11 }}>{t.materials}</b>
      <ul style={{ margin: '5px 0 12px', paddingLeft: 18, fontSize: 11 }}>{Object.entries(supplies.inputs).map(([id, count]) => <li key={id} style={{ color: (c.inventory[id] ?? 0) < count ? '#975e47' : undefined }}>{name(id)} · {c.inventory[id] ?? 0} / {count}</li>)}</ul>
      {error && <p role="status" className="fr-muted">{error}</p>}
      <ReasonButton type="button" className="fr-btn" disabled={blocked || !!error} reason={blocked?undefined:error} onClick={() => onAction({ type: 'craft', recipe: recipe.id, ...(workshop ? { workshop } : {}), ...(material ? { material } : {}), ...(gem ? { gem } : {}) })}>{t.craft} <small className="fr-action-time">{realDuration(3, locale)}</small></ReasonButton>
    </fieldset>
  </details>;
}

export function FantasyCrafting({ c, building, onAction, blocked, propertyWorkshop, workshop }: Props) {
  const [locale] = useLocale();
  const profession = [fantasyLifeJob(c), c.job].find(job => job && fantasyCraftFacility(job) === building) ?? c.job;
  if (fantasyCraftFacility(profession) !== building || !propertyWorkshop && !fantasyBuildings(c).some(facility => facility.id === building)) return null;
  if (profession === 'cook') return <FantasyCooking key={`${c.name}:${c.lifeStartedAt ?? 0}:${profession}`} c={c} station="kitchen" onAction={onAction} blocked={blocked} workshop={workshop}/>;
  const recipes = FANTASY_RECIPES.filter(recipe => recipe.job === profession && fantasyCraftFacility(recipe.job) === building);
  if (!recipes.length) return null;
  const job = FANTASY_JOBS.find(job => job.id === profession), grade = FANTASY_JOB_GRADES[fantasyProfessionGrade(c, profession)];
  return <details className="fr-crafting" open style={{ marginTop: 18 }}>
    <summary style={{ cursor: 'pointer', fontSize: 15, fontWeight: 600 }}>{({ ko: '제작', en: 'Crafting', ja: '制作' })[locale]} · {job?.names[locale]} <small>({recipes.length})</small></summary>
    <p className="fr-muted">{({ ko: '현재 제작 숙련', en: 'Current crafting proficiency', ja: '現在の制作熟練' })[locale]} · {grade.names[locale]} · {c.jobXp[profession] ?? 0}</p>
    <FantasyInteriorMapSurvey c={c} blocked={blocked} onAction={onAction}/>
    {recipes.some(recipe => !!foodMeta(recipe.output)) && <FantasyCooking c={c} station="kitchen" onAction={onAction} blocked={blocked} workshop={workshop}/>}
    {recipes.filter(recipe => !foodMeta(recipe.output)).map(recipe => <CraftRecipe key={recipe.id} c={c} recipe={recipe} onAction={onAction} blocked={blocked} workshop={workshop} />)}
  </details>;
}
