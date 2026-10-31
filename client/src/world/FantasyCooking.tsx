import { useState } from 'react';
import { fantasyLifeJob } from '../../../shared/fantasy-careers.ts';
import type { FantasyAction, FantasyCharacter } from '../../../shared/fantasy.ts';
import { FANTASY_ITEMS } from '../../../shared/fantasy-data.ts';
import { FANTASY_IMPROVISED_RECIPE } from '../../../shared/fantasy-freeform-cooking.ts';
import { fantasyCookingIngredients, fantasyCookingMatches, fantasyCookingPlan, fantasyCookingError, fantasyCookingTrial, fantasyCookingOutputCount, fantasyCookingOutcome, fantasyCookingText, fantasyCookingMaxRepeats, fantasyCookingUnitHours, type FantasyCookingAction, type FantasyCookingStation } from '../../../shared/fantasy-cooking.ts';
import { fantasyOutdoorCookingErrorText } from '../../../shared/fantasy-outdoor-cooking.ts';
import { fantasyCampFireSource } from '../../../shared/fantasy-camping.ts';
import { useLocale } from '../locale.ts';
import { useStore } from '../store.ts';
import { ReasonButton } from './FantasyActionButton.tsx';
import { realDuration } from './FantasyActivity.tsx';
import { itemDisplayName } from './fantasy-action-help.ts';

type CookingForm = { mode: 'fixed' | 'free'; slots: string[]; targets: number[]; repeats: string; source: 'inventory' | 'storage'; recipe: string };
export function fantasyCookingSlotIngredients(slots: string[]) {
  const counts = new Map<string, number>();
  for (const item of slots.slice(0, 5)) if (item) counts.set(item, (counts.get(item) ?? 0) + 1);
  return [...counts].map(([item, count]) => ({ item, count }));
}
export function fantasyCookingWarehouseInventory(business: { inventory: Record<string, number>; parcels: { item: string; count: number }[] }) {
  const inventory = { ...business.inventory };
  for (const parcel of business.parcels) inventory[parcel.item] = (inventory[parcel.item] ?? 0) + parcel.count;
  return inventory;
}
export function fantasyCookingRepeatCount(value: string, max: number) {
  const count = Number(value);
  return Number.isSafeInteger(count) && count >= 1 ? Math.min(count, Math.max(1, max)) : 0;
}

export function FantasyCooking({ c, station, onAction, blocked, mageAvailable = false, workshop }: { c: FantasyCharacter; station: FantasyCookingStation; onAction: (action: FantasyAction) => void; blocked: boolean; mageAvailable?: boolean; workshop?: string }) {
  const [locale] = useLocale(), properties = useStore(state => state.fantasyProperties);
  const [form, setForm] = useState<CookingForm>({ mode: 'fixed', slots: ['', '', '', '', ''], targets: [0, 1], repeats: '1', source: 'inventory', recipe: '' });
  const say = (ko: string, en: string, ja: string) => ({ ko, en, ja })[locale];
  const name = (id: string) => itemDisplayName(id, locale);
  const business = station === 'kitchen' && workshop ? properties?.plots.find(plot => plot.id === workshop && plot.location === c.location && plot.kind === 'commercial' && plot.business?.canUse)?.business : undefined;
  const stored = form.source === 'storage', inventory = stored ? business ? fantasyCookingWarehouseInventory(business) : {} : c.inventory;
  const context = { mageAvailable, ...(stored ? { stock: { inventory, foodLots: [] } } : {}) };
  const ingredients = fantasyCookingSlotIngredients(form.slots), mains = form.slots.slice(0, 3);
  const additions = form.slots.slice(3, 5).flatMap((item, index) => item ? [{ main: form.targets[index], item }] : []);
  const selection: FantasyCookingAction = { type: 'cookMix', station, ingredients, ...(workshop ? { workshop } : {}), ...(stored && workshop ? { storage: workshop } : {}), ...(form.mode === 'free' ? { recipe: FANTASY_IMPROVISED_RECIPE, mains, additions } : {}) };
  const profession = fantasyLifeJob(c) ?? c.job;
  const matches = fantasyCookingMatches(selection, station === 'kitchen' ? profession : undefined).filter(match => !match.improvised && match.batches === 1);
  const chosen = form.mode === 'free' ? FANTASY_IMPROVISED_RECIPE : matches.length === 1 ? matches[0].recipe.id : form.recipe;
  const unitAction: FantasyCookingAction = { ...selection, ...(chosen ? { recipe: chosen } : {}), repeats: 1 };
  const maxRepeats = stored && !business ? 0 : fantasyCookingMaxRepeats(c, unitAction, context), repeats = fantasyCookingRepeatCount(form.repeats, maxRepeats);
  const action: FantasyCookingAction = { ...unitAction, repeats }, resolved = fantasyCookingPlan(action);
  const plan = form.mode === 'fixed' && resolved?.improvised ? undefined : resolved;
  const incomplete = form.mode === 'free' && mains.some(item => !item);
  const localReason = stored && !business ? say('현재 주방의 이용 가능한 영업 창고를 선택하세요.', 'Use an accessible business warehouse at this kitchen.', '現在の厨房で利用できる営業倉庫を選んでください。')
    : incomplete ? say('주재료 세 칸을 모두 채우세요.', 'Fill all three main ingredient slots.', '主材料の3枠すべてを埋めてください。')
    : !ingredients.length ? say('재료를 한 개 이상 선택하세요.', 'Choose at least one ingredient.', '材料を1個以上選んでください。')
    : form.mode === 'fixed' && matches.length === 0 ? say('이 배합에 맞는 정해진 요리법이 없습니다. 자유 조리를 사용하세요.', 'No fixed recipe matches these slots. Use free cooking.', 'この配合に合う定番の料理法がありません。自由調理を使ってください。')
    : !repeats ? say('반복 횟수는 1 이상의 정수로 입력하세요.', 'Enter a whole repeat count of at least 1.', '繰り返し回数は1以上の整数で入力してください。') : undefined;
  const error = fantasyCookingError(c, action, context), reason = localReason ?? (error ? fantasyCookingText(error, locale) ?? fantasyOutdoorCookingErrorText(error, locale) ?? error : undefined);
  const options = fantasyCookingIngredients(station).filter(item => (inventory[item] ?? 0) > 0 || form.slots.includes(item));
  const selectedCount = ingredients.reduce((sum, ingredient) => sum + ingredient.count, 0), outcome = plan && !stored ? fantasyCookingOutcome(c, plan, true, () => 0) : undefined;
  const candidates = plan?.improvised ? plan.candidates ?? [] : [], totalWeight = candidates.reduce((sum, candidate) => sum + candidate.weight, 0);
  const harmful = !!(outcome?.harmful || (plan?.improvised ? candidates.some(candidate => FANTASY_ITEMS.find(item => item.id === candidate.item)?.foodPenalty) : FANTASY_ITEMS.find(item => item.id === plan?.recipe.output)?.foodPenalty));
  const fire = fantasyCampFireSource(c, mageAvailable), unitHours = fantasyCookingUnitHours(unitAction);
  const updateSlot = (index: number, item: string) => setForm(current => {
    const slots = current.slots.map((value, slot) => slot === index ? item : value), targets = [...current.targets];
    if (current.mode === 'free' && index >= 3 && item) {
      const addition = index - 3, other = addition === 0 ? 1 : 0;
      if (slots[other + 3] && targets[addition] === targets[other]) targets[addition] = [0, 1, 2].find(main => main !== targets[other])!;
    }
    return { ...current, slots, targets, recipe: '' };
  });
  const slotControl = (index: number, label: string, optional = false) => <label key={index} style={{ display: 'grid', gap: 4, minWidth: 0 }}>
    <span>{label} <small>· {say('재료 1개', '1 item', '材料1個')}</small></span>
    <select aria-label={label} value={form.slots[index]} onChange={event => updateSlot(index, event.target.value)} style={{ minWidth: 0, width: '100%', minHeight: 44, font: 'inherit' }}>
      <option value="">{optional ? say('추가하지 않음', 'None', '追加しない') : say('재료 선택', 'Choose an ingredient', '材料を選択')}</option>
      {options.map(item => <option key={item} value={item}>{name(item)} · {say('보유', 'Owned', '所持')} {inventory[item] ?? 0}</option>)}
    </select>
  </label>;
  return <section className="fr-outdoor-cooking" style={{ marginTop: 16 }}>
    <h3>{station === 'outdoor' ? say('야외 요리', 'Outdoor cooking', '野外料理') : say('주방 요리', 'Kitchen cooking', '厨房の料理')}</h3>
    <p className="fr-muted">{say('한 번에 재료를 최대 5개 사용합니다. 같은 재료도 한 칸에 1개씩 넣고, 반복 횟수로 여러 번 조리하세요.', 'Use up to 5 ingredient units per cook. Each slot holds 1 item, including duplicates; use repeats to cook again.', '1回に使える材料は最大5個です。同じ材料も1枠に1個ずつ入れ、繰り返し回数でまとめて調理できます。')}</p>
    <p><small>{say('요리 숙련', 'Cooking proficiency', '料理熟練')} · {c.jobXp[form.mode === 'fixed' && station === 'kitchen' ? profession : 'cook'] ?? 0}</small></p>
    <fieldset disabled={blocked} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      <legend>{say('재료 배합', 'Mix ingredients', '材料の配合')} · {selectedCount}/5</legend>
      <div role="group" aria-label={say('조리 방식', 'Cooking mode', '調理方法')} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBlock: 12 }}>
        {(['fixed', 'free'] as const).map(mode => <button key={mode} type="button" className="fr-btn" aria-pressed={form.mode === mode} onClick={() => setForm(current => ({ ...current, mode, targets: [0, 1], recipe: '' }))}>{mode === 'fixed' ? say('정해진 요리', 'Fixed recipes', '定番料理') : say('자유 조리', 'Free cooking', '自由調理')}</button>)}
      </div>
      {business && <label style={{ display: 'grid', gap: 4, marginBottom: 12 }}>{say('재료 출처', 'Ingredient source', '材料の入手元')}
        <select aria-label={say('재료 출처', 'Ingredient source', '材料の入手元')} value={form.source} onChange={event => setForm(current => ({ ...current, source: event.target.value as CookingForm['source'] }))} style={{ minHeight: 44, width: '100%', font: 'inherit' }}>
          <option value="inventory">{say('소지품', 'Carried ingredients', '所持品')}</option><option value="storage">{say('현지 영업 창고', 'Local business warehouse', '現地の営業倉庫')}</option>
        </select>
      </label>}
      {stored && !business && <button type="button" className="fr-btn" onClick={() => setForm(current => ({ ...current, source: 'inventory' }))}>{say('소지품 사용', 'Use carried ingredients', '所持品を使う')}</button>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 12 }}>
        {form.mode === 'fixed' ? form.slots.map((_, index) => slotControl(index, say(`재료 ${index + 1}`, `Material ${index + 1}`, `材料${index + 1}`), true))
          : <>{mains.map((_, index) => slotControl(index, say(`주재료 ${index + 1}`, `Main ingredient ${index + 1}`, `主材料${index + 1}`)))}
            {form.slots.slice(3, 5).map((_, index) => <div key={`addition-${index}`} className="fr-card" style={{ display: 'grid', gap: 8, minWidth: 0 }}>
              {slotControl(index + 3, say(`추가 재료 ${index + 1}`, `Additional ingredient ${index + 1}`, `追加材料${index + 1}`), true)}
              <label style={{ display: 'grid', gap: 4 }}>{say('연결할 주재료', 'Attach to main ingredient', '組み合わせる主材料')}
                <select aria-label={say(`추가 재료 ${index + 1}의 주재료`, `Main ingredient for addition ${index + 1}`, `追加材料${index + 1}の主材料`)} value={form.targets[index]} disabled={!form.slots[index + 3]} onChange={event => { const main = Number(event.target.value); setForm(current => ({ ...current, targets: current.targets.map((target, addition) => addition === index ? main : target) })); }} style={{ minHeight: 44, width: '100%', minWidth: 0, font: 'inherit' }}>
                  {mains.map((item, main) => <option key={main} value={main} disabled={form.slots[index === 0 ? 4 : 3] !== '' && form.targets[index === 0 ? 1 : 0] === main}>{say(`주재료 ${main + 1}`, `Main ingredient ${main + 1}`, `主材料${main + 1}`)}{item ? ` · ${name(item)}` : ''}</option>)}
                </select>
              </label>
            </div>)}
          </>}
      </div>
      {form.mode === 'free' && <p className="fr-muted">{say('주재료는 3개입니다. 추가 재료는 최대 2개이며 서로 다른 주재료에 연결합니다. 연결 방식과 재료가 세 후보의 확률을 바꿉니다.', 'Choose 3 main ingredients and up to 2 additions, each attached to a different main position. Ingredients and attachments change the chances of the three candidates.', '主材料は3個、追加材料は最大2個です。追加材料は別々の主材料の位置に組み合わせます。材料と組み合わせ方で3候補の確率が変わります。')}</p>}
      {options.length === 0 && <p className="fr-muted">{say('사용할 수 있는 요리 재료가 없습니다.', 'No cooking ingredients are available from this source.', 'この入手元には使える料理材料がありません。')}</p>}
      {form.mode === 'fixed' && matches.length > 1 && <label style={{ display: 'grid', gap: 4, marginBlock: 12 }}>{say('이 배합으로 만들 요리', 'Dish for this mixture', 'この配合で作る料理')}
        <select value={form.recipe} onChange={event => setForm(current => ({ ...current, recipe: event.target.value }))} style={{ minHeight: 44, width: '100%' }}><option value="">{say('요리를 선택하세요', 'Choose a dish', '料理を選んでください')}</option>{matches.map(match => <option key={match.recipe.id} value={match.recipe.id}>{name(match.recipe.output)} ×{fantasyCookingOutputCount(c, match)}</option>)}</select>
      </label>}
      <label style={{ display: 'grid', gap: 4, marginTop: 12 }}>{say('반복 횟수', 'Repeat count', '繰り返し回数')}
        <input aria-label={say('반복 횟수', 'Repeat count', '繰り返し回数')} type="number" inputMode="numeric" min="1" max={maxRepeats} step="1" value={repeats ? String(repeats) : form.repeats} onChange={event => { const value = event.target.value; setForm(current => ({ ...current, repeats: value === '' ? '' : String(fantasyCookingRepeatCount(value, maxRepeats) || value) })); }} style={{ maxWidth: 120, minHeight: 44, padding: 6, font: 'inherit' }}/>
      </label>
      <p><small>{say(`가능한 최대 반복: ${maxRepeats}`, `Available repeats: ${maxRepeats}`, `繰り返し可能回数: ${maxRepeats}`)} · {say('총 소요 시간', 'Total duration', '合計所要時間')} {realDuration(unitHours * repeats, locale)}</small></p>
      {plan && !incomplete && <div className="fr-card" style={{ marginTop: 12 }}>
        {plan.improvised ? <><b>{say('한 번 조리할 때마다 세 후보 중 하나가 결정됩니다.', 'Each cook rolls one of these three candidates.', '調理するたびに3候補から1つが決まります。')}</b><ul style={{ paddingLeft: 20 }}>{candidates.map(candidate => <li key={candidate.item} data-cooking-candidate={candidate.item}>{name(candidate.item)}{totalWeight > 0 ? ` · ${Math.round(candidate.weight / totalWeight * 100)}%` : ''}</li>)}</ul></> : <b>{name(outcome?.item ?? plan.recipe.output)} ×{outcome?.count ?? fantasyCookingOutputCount(c, plan)}</b>}
        <p><small>{stored ? say('실제 조리 시점의 재료 상태를 확인합니다.', 'Actual ingredient condition is checked when cooking.', '実際の調理時に材料の状態を確認します。') : <>{say('현재 재료 기준 조리 성공 확률', 'Cooking success chance with current ingredients', '現在の材料での調理成功率')} {Math.round(fantasyCookingTrial(c, plan).chance * 100)}%</>}</small></p>
        {harmful && <p><small>{say('조리를 잘해도 먹으면 몸에 해로울 수 있습니다.', 'Even well cooked, this dish may be harmful to eat.', '上手に調理しても、食べると体に害を及ぼすことがあります。')}</small></p>}
        {plan.recipe.tools.length > 0 && <p><small>{say('필요 도구', 'Required tools', '必要な道具')} · {plan.recipe.tools.map(name).join(' · ')}</small></p>}
      </div>}
      {station === 'outdoor' && <p><small>{fire === 'mage' ? say('마법사가 무료로 불을 붙입니다.', 'A mage lights the fire for free.', '魔術師が無料で点火します。') : say('매번 조리할 때마다 목재 1개가 들며 도구는 남습니다.', 'Each repeated cook uses 1 wood; tools remain.', '繰り返しの調理1回ごとに木材1個を使い、道具は残ります。')}</small></p>}
      <p className="fr-muted">{say('요리에 실패하면 탄 음식 같은 실패작이 남습니다. 재료와 시간은 소모되고 숙련은 조금 오릅니다.', 'Failed cooking still produces a bad dish. Ingredients and time are consumed; proficiency increases a little.', '調理に失敗すると焦げた料理などの失敗作が残ります。材料と時間を使い、熟練が少し上がります。')}</p>
      {reason && <p role="status" className="fr-muted">{reason}</p>}
      <ReasonButton type="button" className="fr-btn primary" disabled={blocked || !!reason || maxRepeats < 1} reason={blocked ? undefined : reason} onClick={() => onAction(action)}>{say('선택한 재료로 요리', 'Cook selected ingredients', '選んだ材料で調理')}</ReasonButton>
    </fieldset>
  </section>;
}
