import { ReasonButton } from './FantasyActionButton.tsx';
import { useEffect, useState } from 'react';
import type { FantasyAction, FantasyCharacter } from '../../../shared/fantasy.ts';
import { FANTASY_ITEMS } from '../../../shared/fantasy-data.ts';
import { fantasyStats } from '../../../shared/fantasy-engine.ts';
import { fantasyBuildings } from '../../../shared/fantasy-town.ts';
import {
  FANTASY_ALCHEMY_FORMULAS, FANTASY_COMPANIONS, FANTASY_MAGIC_COMBINATIONS, FANTASY_MAGIC_ELEMENTS, FANTASY_MAGIC_FORMS,
  fantasyCompanionBonus, fantasyCompanyCapacity, fantasySpellCapacity, type FantasyCompanyKind,
} from '../../../shared/fantasy-specializations.ts';
import { useLocale } from '../locale.ts';
import { useStore } from '../store.ts';
import { realDuration } from './FantasyActivity.tsx';
import { statLabels } from './fantasy-copy.ts';

type Props = { c: FantasyCharacter; onAction: (action: FantasyAction) => void; blocked: boolean };
const kindFor = (job: string): FantasyCompanyKind | undefined => job === 'leader' ? 'troop' : job === 'crimeboss' ? 'syndicate' : job === 'summoner' ? 'summons' : undefined;

export function FantasyCompanyPanel({ c, onAction, blocked }: Props) {
  const [locale] = useLocale();
  const connected = useStore(s => s.wsConnected);
  const kind = kindFor(c.job);
  const t = {
    ko: { troop: '부대 관리', syndicate: '조직 관리', summons: '소환 계약', wrong: '지도자·범죄조직두목·소환술사의 전용 관리 메뉴입니다.', capacity: '동료', ready: '대기', injured: '부상', absent: '이탈', assigned: '편성 중', assign: '편성', unassign: '편성 해제', mission: '현지 임무 시작', recruit: '고용·계약할 동료', hire: '고용', bind: '계약', recover: '치료', renew: '재계약', dismiss: '계약 종료', more: '계약 관리', empty: '아직 계약한 동료가 없습니다.', unavailable: '고용·재계약에는 해당 길드·시장·도서관·탑을 방문해야 합니다.', treatment: '치료: 여관 또는 신전 + 회복 물약 1개', bonus: '현재 지원', check: '판정', guard: '방호', upkeep: '소환 지원 1회당 편성한 동료마다 MP 2', missionHelp: '편성한 건강한 동료가 참여합니다. 실패 시 부상하거나 이탈할 수 있습니다.' },
    en: { troop: 'Company management', syndicate: 'Organization management', summons: 'Summoning contracts', wrong: 'This panel is for leaders, crime bosses and summoners.', capacity: 'Companions', ready: 'Ready', injured: 'Injured', absent: 'Departed', assigned: 'Assigned', assign: 'Assign', unassign: 'Unassign', mission: 'Start local mission', recruit: 'Available companions', hire: 'Hire', bind: 'Bind', recover: 'Treat', renew: 'Renew', dismiss: 'End agreement', more: 'Manage agreement', empty: 'You have no contracted companions yet.', unavailable: 'Recruitment and renewed agreements require a suitable guild, market, library or tower.', treatment: 'Treatment: an inn or temple and one recovery potion', bonus: 'Current support', check: 'Check', guard: 'Protection', upkeep: 'Summon support costs 2 MP per assigned companion each time', missionHelp: 'Assigned healthy companions take part. Failure can cause injury or departure.' },
    ja: { troop: '部隊の管理', syndicate: '組織の管理', summons: '召喚契約', wrong: '指導者・裏社会の頭領・召喚士の専用管理です。', capacity: '仲間', ready: '待機', injured: '負傷', absent: '離脱', assigned: '編成中', assign: '編成', unassign: '編成を外す', mission: '現地任務を始める', recruit: '雇用・契約できる仲間', hire: '雇用', bind: '契約', recover: '治療', renew: '再契約', dismiss: '契約を終える', more: '契約の管理', empty: 'まだ契約した仲間はいません。', unavailable: '雇用・再契約には対応するギルド・市場・図書館・塔が必要です。', treatment: '治療：宿か神殿と回復薬1個', bonus: '現在の支援', check: '判定', guard: '防護', upkeep: '召喚の支援は編成した仲間1人につき毎回MP2', missionHelp: '編成した元気な仲間が参加します。失敗すると負傷や離脱が起こり得ます。' },
  }[locale];
  if (!kind) return <p className="fr-muted">{t.wrong}</p>;
  const members = c.specialization?.companies?.[kind]?.members ?? [];
  const capacity = fantasyCompanyCapacity(c, kind);
  const buildings = fantasyBuildings(c);
  const canHire = buildings.some(b => (kind === 'troop' ? ['guild'] : kind === 'summons' ? ['tower', 'library'] : ['market', 'guild']).includes(b.id));
  const canTreat = buildings.some(b => ['inn', 'temple'].includes(b.id)) && (c.inventory.potion ?? 0) > 0;
  const active = members.filter(m => m.assigned && m.condition === 'ready' && m.hp > 0);
  const bonus = fantasyCompanionBonus(c);
  const busy = blocked || !connected;
  const facility = kind === 'troop' ? { ko: '길드', en: 'guild', ja: 'ギルド' }[locale] : kind === 'syndicate' ? { ko: '시장 또는 길드', en: 'market or guild', ja: '市場かギルド' }[locale] : { ko: '도서관 또는 마법사의 탑', en: 'library or mage tower', ja: '図書館か魔術師の塔' }[locale];
  const command = (operation: Extract<FantasyAction, { type: 'command' }>['operation'], member?: string) => onAction({ type: 'command', kind, operation, ...(member ? { member } : {}) });
  return <section className="fr-specialty">
    <h2>{t[kind]}</h2>
    <p>{t.capacity} {members.length}/{capacity}</p>
    {active.length > 0 && <p className="fr-muted">{{ ko: '전투 동료', en: 'Battle companions', ja: '戦闘の仲間' }[locale]}: {active.slice(0, 2).map(member => FANTASY_COMPANIONS.find(entry => entry.id === member.id)?.names[locale]).join(' · ')}</p>}
    <p className="fr-muted">{t.bonus}: {t.check} +{bonus.check} · {t.guard} {bonus.guard}</p>
    {kind === 'summons' && <p className="fr-muted">{t.upkeep}</p>}
    {!members.length && <p className="fr-muted">{t.empty}</p>}
    {members.map(member => {
      const template = FANTASY_COMPANIONS.find(entry => entry.id === member.id)!;
      if (!template) return null;
      const fee = Math.ceil(template.cost / 2);
      return <article className="fr-card" key={member.id}>
        <div className="fr-section-title"><h3>{template.names[locale]}</h3><span className="fr-tag">{t[member.condition]}{member.assigned ? ` · ${t.assigned}` : ''}</span></div>
        <p>{template.role[locale]} · HP {member.hp}/{template.hp}</p>
        <div className="fr-action-grid">
          {member.condition === 'ready' && <ReasonButton type="button" className="fr-btn" disabled={busy || member.hp <= 0} onClick={() => command('assign', member.id)}>{member.assigned ? t.unassign : t.assign}</ReasonButton>}
          {member.condition === 'injured' && <ReasonButton type="button" className="fr-btn" disabled={busy || !canTreat} reason={busy?undefined:!canTreat?t.treatment:undefined} onClick={() => command('recover', member.id)}>{t.recover} · {realDuration(2, locale)}</ReasonButton>}
          {member.condition === 'absent' && <ReasonButton type="button" className="fr-btn" disabled={busy || !canHire || c.gold < fee || c.mp < template.mp || template.mp > 0 && (c.mana?.strain ?? 0) >= 80} reason={busy?undefined:!canHire?t.unavailable:c.gold<fee?{ko:'소지금이 부족합니다.',en:'Not enough gold.',ja:'所持金が足りません。'}[locale]:c.mp<template.mp?{ko:'MP가 부족합니다.',en:'Not enough MP.',ja:'MPが足りません。'}[locale]:{ko:'마나 부하가 높습니다.',en:'Mana strain is too high.',ja:'マナの負荷が高すぎます。'}[locale]} onClick={() => command('recontract', member.id)}>{t.renew} · {fee}G{template.mp ? ` · MP${template.mp}` : ''} · {realDuration(2, locale)}</ReasonButton>}
        </div>
        {member.condition === 'injured' && <p className="fr-muted">{t.treatment}</p>}
        <details><summary>{t.more}</summary><ReasonButton type="button" className="fr-btn" disabled={busy} onClick={() => command('dismiss', member.id)}>{t.dismiss}</ReasonButton></details>
      </article>;
    })}
    <p className="fr-muted">{t.missionHelp}</p>
    <ReasonButton type="button" className="fr-btn primary" disabled={busy || !active.length || kind === 'summons' && (c.mp < active.length * 2 || (c.mana?.strain ?? 0) >= 80)} reason={busy?undefined:!active.length?{ko:'임무에 나갈 건강한 동료를 편성하세요.',en:'Assign a healthy companion first.',ja:'任務に出る元気な仲間を編成してください。'}[locale]:c.mp<active.length*2?{ko:'MP가 부족합니다.',en:'Not enough MP.',ja:'MPが足りません。'}[locale]:{ko:'마나 부하가 높습니다.',en:'Mana strain is too high.',ja:'マナの負荷が高すぎます。'}[locale]} onClick={() => command('mission')}>{t.mission} · {realDuration(4, locale)}</ReasonButton>
    <details className="fr-card"><summary>{t.recruit}</summary>
      {!canHire && <p className="fr-muted">{{ ko: `고용·재계약에는 ${facility}가 필요합니다.`, en: `Recruitment and renewed agreements require a ${facility}.`, ja: `雇用・再契約には${facility}が必要です。` }[locale]}</p>}
      {FANTASY_COMPANIONS.filter(entry => entry.kind === kind && !members.some(member => member.id === entry.id)).map(entry => <div className="fr-service-row" key={entry.id}>
        <span>{entry.names[locale]}<small>{entry.role[locale]} · {t.check} +{entry.check} · {t.guard} {entry.guard} · {realDuration(2, locale)}</small></span>
        <b>{entry.cost}G{entry.mp ? ` · MP${entry.mp}` : ''}</b>
        <ReasonButton type="button" className="fr-btn" disabled={busy || !canHire || members.length >= capacity || c.gold < entry.cost || c.mp < entry.mp || entry.mp > 0 && (c.mana?.strain ?? 0) >= 80} reason={busy?undefined:!canHire?t.unavailable:members.length>=capacity?{ko:'편성 가능한 인원이 가득 찼습니다.',en:'Your company is at capacity.',ja:'仲間の人数が上限です。'}[locale]:c.gold<entry.cost?{ko:'소지금이 부족합니다.',en:'Not enough gold.',ja:'所持金が足りません。'}[locale]:c.mp<entry.mp?{ko:'MP가 부족합니다.',en:'Not enough MP.',ja:'MPが足りません。'}[locale]:{ko:'마나 부하가 높습니다.',en:'Mana strain is too high.',ja:'マナの負荷が高すぎます。'}[locale]} onClick={() => command('hire', entry.id)}>{kind === 'summons' ? t.bind : t.hire}</ReasonButton>
      </div>)}
    </details>
  </section>;
}

function MagicSlot({ c, onAction, blocked, slot }: Props & { slot: number }) {
  const [locale] = useLocale(); const connected = useStore(s => s.wsConnected);
  const saved = c.specialization?.spells?.find(spell => spell.slot === slot);
  const [element, setElement] = useState<string>(saved?.element ?? 'flame');
  const [form, setForm] = useState<string>(saved?.form ?? 'bolt');
  useEffect(() => { setElement(saved?.element ?? 'flame'); setForm(saved?.form ?? 'bolt'); }, [saved?.element, saved?.form]);
  const selected = FANTASY_MAGIC_COMBINATIONS.find(combo => combo.element === element && combo.form === form);
  const prepared = saved && FANTASY_MAGIC_COMBINATIONS.find(combo => combo.element === saved.element && combo.form === saved.form);
  const t = {
    ko: { slot: '저장 칸', element: '원소', form: '형태', prepare: '합성하여 저장', cast: '발동', empty: '저장한 마법이 없습니다.', invalid: '등록된 조합이 아닙니다.', heal: 'HP 회복', guard: '다음 피해 감소', check: '다음 판정', strain: '마나 부하가 높습니다. 쉬어야 합니다.' },
    en: { slot: 'Slot', element: 'Element', form: 'Form', prepare: 'Prepare and save', cast: 'Cast', empty: 'No spell saved.', invalid: 'This combination is not registered.', heal: 'Restore HP', guard: 'Reduce next damage', check: 'Next check', strain: 'Mana strain is high. Rest first.' },
    ja: { slot: '保存枠', element: '元素', form: '形', prepare: '合成して保存', cast: '使う', empty: '魔法は未保存です。', invalid: '登録されていない組合せです。', heal: 'HP回復', guard: '次の被害を軽減', check: '次の判定', strain: 'マナの負荷が高いので休息が必要です。' },
  }[locale];
  const effect = (combo: typeof FANTASY_MAGIC_COMBINATIONS[number]) => combo.effect === 'heal' ? `${t.heal} ${combo.power}` : combo.effect === 'guard' ? `${t.guard} ${combo.power}` : `${t.check} ${combo.stat ? statLabels[locale][combo.stat] : ''} +${combo.power}`;
  const highStrain = (c.mana?.strain ?? 0) >= 80;
  return <article className="fr-card">
    <h3>{t.slot} {slot}</h3>
    <div className="fr-action-grid">
      <label>{t.element} <select value={element} onChange={event => setElement(event.target.value)} disabled={blocked}><option value="" disabled>—</option>{FANTASY_MAGIC_ELEMENTS.map(value => <option key={value.id} value={value.id}>{value.names[locale]}</option>)}</select></label>
      <label>{t.form} <select value={form} onChange={event => setForm(event.target.value)} disabled={blocked}>{FANTASY_MAGIC_FORMS.map(value => <option key={value.id} value={value.id}>{value.names[locale]}</option>)}</select></label>
    </div>
    <p className="fr-muted">{selected ? `${selected.names[locale]} · MP${selected.mp} · ${effect(selected)}` : t.invalid}</p>
    <ReasonButton type="button" className="fr-btn" disabled={blocked || !connected || !selected || saved?.element === element && saved?.form === form} reason={blocked||!connected?undefined:!selected?t.invalid:{ko:'이미 같은 마법이 저장되어 있습니다.',en:'This spell is already saved.',ja:'同じ魔法をすでに保存しています。'}[locale]} onClick={() => onAction({ type: 'magicPrepare', slot, element, form })}>{t.prepare} · {realDuration(1, locale)}</ReasonButton>
    <div className="fr-service-row"><span>{prepared ? prepared.names[locale] : t.empty}{prepared && <small>MP{prepared.mp} · {effect(prepared)}</small>}</span>
      {prepared && <ReasonButton type="button" className="fr-btn primary" disabled={blocked || !connected || highStrain || c.mp < prepared.mp || (prepared.effect === 'heal' ? c.hp >= fantasyStats(c).hp : !!c.buff)} reason={blocked||!connected?undefined:highStrain?t.strain:c.mp<prepared.mp?{ko:'MP가 부족합니다.',en:'Not enough MP.',ja:'MPが足りません。'}[locale]:prepared.effect==='heal'?{ko:'HP가 이미 가득 찼습니다.',en:'HP is already full.',ja:'HPはすでに満タンです。'}[locale]:{ko:'현재 강화 효과를 먼저 사용해야 합니다.',en:'Use the current temporary effect first.',ja:'先に現在の強化効果を使ってください。'}[locale]} onClick={() => onAction({ type: 'magicCast', slot })}>{t.cast}</ReasonButton>}
    </div>
    {highStrain && <p className="fr-muted">{t.strain}</p>}
    {prepared && !highStrain && (c.mp < prepared.mp ? <p className="fr-muted">{{ ko: 'MP가 부족합니다.', en: 'Not enough MP.', ja: 'MPが足りません。' }[locale]}</p> : prepared.effect === 'heal' && c.hp >= fantasyStats(c).hp ? <p className="fr-muted">{{ ko: 'HP가 가득 차 있습니다.', en: 'HP is already full.', ja: 'HPは満タンです。' }[locale]}</p> : prepared.effect !== 'heal' && c.buff ? <p className="fr-muted">{{ ko: '현재 일시 강화를 먼저 사용해야 합니다.', en: 'Use your current temporary buff first.', ja: '先に現在の一時強化を使ってください。' }[locale]}</p> : null)}
  </article>;
}

export function FantasyMagicPanel(props: Props) {
  const [locale] = useLocale(); const { c } = props;
  if (c.job !== 'mage') return <p className="fr-muted">{{ ko: '마법사 전용 마법 합성 메뉴입니다.', en: 'Spell composition is for mages.', ja: '魔術師専用の魔法合成です。' }[locale]}</p>;
  const capacity = fantasySpellCapacity(c);
  return <section className="fr-specialty"><h2>{{ ko: '마법 합성', en: 'Spell composition', ja: '魔法の合成' }[locale]}</h2>
    <p className="fr-muted">{{ ko: '저장은 게임 1시간, 발동은 MP를 소모합니다. 저장 칸은 마법사 숙련 30·100에서 늘어납니다.', en: 'Preparing takes 1 game hour; casting spends MP. Mage proficiency 30 and 100 unlock more slots.', ja: '保存はゲーム内1時間、使用はMPを消費します。魔術師の熟練30・100で枠が増えます。' }[locale]}</p>
    {Array.from({ length: capacity }, (_, index) => <MagicSlot key={index + 1} {...props} slot={index + 1} />)}
  </section>;
}

export function FantasyAlchemyPanel({ c, onAction, blocked }: Props) {
  const [locale] = useLocale(); const connected = useStore(s => s.wsConnected);
  const workshop = fantasyBuildings(c).some(building => building.id === 'alchemist');
  const t = {
    ko: { title: '연금 조합', only: '연금술사 전용 조합 메뉴입니다.', facility: '현재 지역에 연금 공방이 필요합니다.', inputs: '재료', output: '기본 결과', mix: '조합하기', missing: '재료가 부족합니다.', quality: '재료와 숙련이 품질을 좌우하며, 결과 등급은 조금 달라질 수 있습니다. 실패하면 첫 재료 1개를 잃습니다.' },
    en: { title: 'Alchemy mixtures', only: 'This mixture menu is for alchemists.', facility: 'A local alchemy workshop is required.', inputs: 'Ingredients', output: 'Base result', mix: 'Mix', missing: 'Ingredients are missing.', quality: 'Materials and proficiency chiefly determine quality, with small grade variation. Failure loses one unit of the first ingredient.' },
    ja: { title: '錬金調合', only: '錬金術師専用の調合です。', facility: '現地の錬金工房が必要です。', inputs: '材料', output: '基本の結果', mix: '調合', missing: '材料が足りません。', quality: '品質は材料と熟練が中心で、等級には小さな差が出ます。失敗すると最初の材料を1個失います。' },
  }[locale];
  if (c.job !== 'alchemist') return <p className="fr-muted">{t.only}</p>;
  const name = (id: string) => { const item = FANTASY_ITEMS.find(item => item.id === id); return item?.names?.[locale] ?? item?.name ?? id; };
  return <section className="fr-specialty"><h2>{t.title}</h2>{!workshop && <p className="fr-muted">{t.facility}</p>}
    <p className="fr-muted">{t.quality}</p>
    {FANTASY_ALCHEMY_FORMULAS.map(formula => {
      const inputs = Object.entries(formula.inputs) as [string, number][];
      const enough = inputs.every(([id, count]) => (c.inventory[id] ?? 0) >= count);
      return <details className="fr-card" key={formula.id}><summary>{formula.names[locale]} · {realDuration(3, locale)}</summary>
        <p>{t.inputs}: {inputs.map(([id, count]) => `${name(id)} ${c.inventory[id] ?? 0}/${count}`).join(' · ')}</p>
        <p>{t.output}: {name(formula.output)} ×1 · D12 / DC{Math.ceil(formula.dc*12/20)}</p>
        {!enough && <p className="fr-muted">{t.missing}</p>}
        <ReasonButton type="button" className="fr-btn primary" disabled={blocked || !connected || !workshop || !enough} reason={blocked||!connected?undefined:!workshop?t.facility:t.missing} onClick={() => onAction({ type: 'alchemy', formula: formula.id })}>{t.mix}</ReasonButton>
      </details>;
    })}
  </section>;
}
