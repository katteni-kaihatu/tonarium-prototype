import { fantasyLifeJob } from '../../../shared/fantasy-careers.ts';
import { fantasyFacilityOpen, fantasyFacilityClosedText } from '../../../shared/fantasy-facility-hours.ts';
import { fantasyHasWorkerCompany, fantasyIsWorkerCompanion, fantasyWorkerCompanionCapacity, fantasyWorkerCompanionLevel } from '../../../shared/fantasy-worker-companions.ts';
import {fantasyCompanionAvailable} from '../../../shared/fantasy-summon-paths.ts';
import {FantasyAlchemySynthesis} from './FantasyAlchemySynthesis.tsx';
import { fantasyAlchemyFormulaKnown, fantasyAlchemyUnidentifiedFormulaName } from '../../../shared/fantasy-alchemy-discovery.ts';
import {FantasyRunicCircle} from './FantasyRunicCircle.tsx';
import { ReasonButton } from './FantasyActionButton.tsx';
import { useState } from 'react';
import type { FantasyAction, FantasyCharacter } from '../../../shared/fantasy.ts';
import { FANTASY_ITEMS } from '../../../shared/fantasy-data.ts';
import { fantasyBuildings } from '../../../shared/fantasy-town.ts';
import { FANTASY_ALCHEMY_FORMULAS, FANTASY_COMPANIONS, fantasyCompanionBonus, fantasyActiveCompanions, fantasyCompanyCapacity, type FantasyCompanyKind } from '../../../shared/fantasy-specializations.ts';
import { useLocale } from '../locale.ts';
import { useStore } from '../store.ts';
import { realDuration } from './FantasyActivity.tsx';

type Props = { c: FantasyCharacter; onAction: (action: FantasyAction) => void; blocked: boolean };
const kindFor = (job: string): FantasyCompanyKind | undefined => job === 'leader' ? 'troop' : job === 'crimeboss' ? 'syndicate' : job === 'summoner' ? 'summons' : undefined;

export function FantasyCompanyPanel({ c, onAction, blocked }: Props) {
  const [locale] = useLocale();
  const connected = useStore(s => s.wsConnected);
  const primary = kindFor(c.job), [selectedKind, setSelectedKind] = useState<FantasyCompanyKind | undefined>(undefined);
  const kinds: FantasyCompanyKind[] = [...(primary ? [primary] : []), ...(fantasyHasWorkerCompany(c) && primary !== 'troop' ? ['troop' as const] : [])];
  const kind = selectedKind && kinds.includes(selectedKind) ? selectedKind : kinds[0];
  const t = {
    ko: { troop: '부대 관리', syndicate: '조직 관리', summons: '소환 계약', wrong: '지도자·범죄조직두목·소환술사의 전용 관리 메뉴입니다.', capacity: '동료', ready: '대기', injured: '부상', absent: '이탈', assigned: '편성 중', assign: '편성', unassign: '편성 해제', mission: '현지 임무 시작', recruit: '고용·계약할 동료', hire: '고용', bind: '계약', recover: '치료', renew: '재계약', dismiss: '계약 종료', more: '계약 관리', empty: '아직 계약한 동료가 없습니다.', unavailable: '고용·재계약에는 해당 길드·시장·도서관·탑을 방문해야 합니다.', treatment: '치료: 여관 또는 신전 + 회복 물약 1개', bonus: '현재 지원', check: '판정', guard: '방호', upkeep: '소환 지원 1회당 편성한 동료마다 MP 2', missionHelp: '편성한 건강한 동료가 참여합니다. 실패 시 부상하거나 이탈할 수 있습니다.' },
    en: { troop: 'Company management', syndicate: 'Organization management', summons: 'Summoning contracts', wrong: 'This panel is for leaders, crime bosses and summoners.', capacity: 'Companions', ready: 'Ready', injured: 'Injured', absent: 'Departed', assigned: 'Assigned', assign: 'Assign', unassign: 'Unassign', mission: 'Start local mission', recruit: 'Available companions', hire: 'Hire', bind: 'Bind', recover: 'Treat', renew: 'Renew', dismiss: 'End agreement', more: 'Manage agreement', empty: 'You have no contracted companions yet.', unavailable: 'Recruitment and renewed agreements require a suitable guild, market, library or tower.', treatment: 'Treatment: an inn or temple and one recovery potion', bonus: 'Current support', check: 'Check', guard: 'Protection', upkeep: 'Summon support costs 2 MP per assigned companion each time', missionHelp: 'Assigned healthy companions take part. Failure can cause injury or departure.' },
    ja: { troop: '部隊の管理', syndicate: '組織の管理', summons: '召喚契約', wrong: '指導者・裏社会の頭領・召喚士の専用管理です。', capacity: '仲間', ready: '待機', injured: '負傷', absent: '離脱', assigned: '編成中', assign: '編成', unassign: '編成を外す', mission: '現地任務を始める', recruit: '雇用・契約できる仲間', hire: '雇用', bind: '契約', recover: '治療', renew: '再契約', dismiss: '契約を終える', more: '契約の管理', empty: 'まだ契約した仲間はいません。', unavailable: '雇用・再契約には対応するギルド・市場・図書館・塔が必要です。', treatment: '治療：宿か神殿と回復薬1個', bonus: '現在の支援', check: '判定', guard: '防護', upkeep: '召喚の支援は編成した仲間1人につき毎回MP2', missionHelp: '編成した元気な仲間が参加します。失敗すると負傷や離脱が起こり得ます。' },
  }[locale];
  if (!kind) return <p className="fr-muted">{t.wrong}</p>;
  const members = (c.specialization?.companies?.[kind]?.members ?? []).filter(member => kind !== 'troop' || c.job === 'leader' || fantasyIsWorkerCompanion(member.id));
  const capacity = kind === 'troop' && c.job !== 'leader' ? fantasyWorkerCompanionCapacity(c) : fantasyCompanyCapacity(c, kind);
  const buildings = fantasyBuildings(c);
  const canHire = buildings.some(b => (kind === 'troop' ? ['guild'] : kind === 'summons' ? ['tower', 'library'] : ['market', 'guild']).includes(b.id));
  const canTreat = buildings.some(b => ['inn', 'temple'].includes(b.id)) && (c.inventory.potion ?? 0) > 0;
  const active = members.filter(m => fantasyCompanionAvailable(c,m.id) && m.assigned && m.condition === 'ready' && m.hp > 0);
  const bonus = fantasyCompanionBonus(c), battleActive = fantasyActiveCompanions(c);
  const busy = blocked || !connected;
  const facility = kind === 'troop' ? { ko: '길드', en: 'guild', ja: 'ギルド' }[locale] : kind === 'syndicate' ? { ko: '시장 또는 길드', en: 'market or guild', ja: '市場かギルド' }[locale] : { ko: '도서관 또는 마법사의 탑', en: 'library or mage tower', ja: '図書館か魔術師の塔' }[locale];
  const command = (operation: Extract<FantasyAction, { type: 'command' }>['operation'], member?: string) => onAction({ type: 'command', kind, operation, ...(member ? { member } : {}) });
  return <section className="fr-specialty">
    {kinds.length > 1 && <div className="fr-action-grid">{kinds.map(value => <button type="button" key={value} className="fr-btn" aria-pressed={kind === value} onClick={() => setSelectedKind(value)}>{value === 'troop' && c.job !== 'leader' ? {ko:'고용 전투원',en:'Employed fighters',ja:'雇用戦闘員'}[locale] : t[value]}</button>)}</div>}
    <h2>{t[kind]}</h2>
    <p>{t.capacity} {members.length}/{capacity}</p>
    <p className="fr-muted">{{ko:'전투 편성은 부대·조직·소환을 합해 최대 2명입니다.',en:'Assign at most two battle companions across company, organization and summons.',ja:'部隊・組織・召喚を合わせて戦闘編成は最大2人です。'}[locale]}</p>
    {battleActive.length > 0 && <p className="fr-muted">{{ ko: '전투 동료', en: 'Battle companions', ja: '戦闘の仲間' }[locale]}: {battleActive.map(({member}) => FANTASY_COMPANIONS.find(entry => entry.id === member.id)?.names[locale]).join(' · ')}</p>}
    <p className="fr-muted">{t.bonus}: {t.check} +{bonus.check} · {t.guard} {bonus.guard}</p>
    {kind === 'summons' && <p className="fr-muted">{t.upkeep}</p>}
    {!members.length && <p className="fr-muted">{t.empty}</p>}
    {members.map(member => {
      const template = FANTASY_COMPANIONS.find(entry => entry.id === member.id)!;
      if (!template) return null;
      const fee = Math.ceil(template.cost / 2);
      return <article className="fr-card" key={member.id}>
        <div className="fr-section-title"><h3>{template.names[locale]}</h3><span className="fr-tag">{t[member.condition]}{member.assigned ? ` · ${t.assigned}` : ''}</span></div>
        <p>{template.role[locale]} · HP {member.hp}/{template.hp}{fantasyIsWorkerCompanion(member.id) ? ` · Lv${fantasyWorkerCompanionLevel(member)} · ${member.missions} ${{ko:'임무',en:'missions',ja:'任務'}[locale]}` : ''}</p>
        <div className="fr-action-grid">
          {member.condition === 'ready' && <ReasonButton type="button" className="fr-btn" disabled={busy || !fantasyCompanionAvailable(c,member.id) || member.hp <= 0 || !member.assigned && battleActive.length >= 2} reason={busy?undefined:!member.assigned&&battleActive.length>=2?{ko:'전투 편성은 합계 2명까지입니다.',en:'You may assign at most two battle companions.',ja:'戦闘編成は合計2人までです。'}[locale]:undefined} onClick={() => command('assign', member.id)}>{member.assigned ? t.unassign : t.assign}</ReasonButton>}
          {member.condition === 'injured' && <ReasonButton type="button" className="fr-btn" disabled={busy || !canTreat} reason={busy?undefined:!canTreat?t.treatment:undefined} onClick={() => command('recover', member.id)}>{t.recover} · {realDuration(2, locale)}</ReasonButton>}
          {member.condition === 'absent' && <ReasonButton type="button" className="fr-btn" disabled={busy || !canHire || c.gold < fee || c.mp < template.mp || template.mp > 0 && (c.mana?.strain ?? 0) >= 80} reason={busy?undefined:!canHire?t.unavailable:c.gold<fee?{ko:'소지금이 부족합니다.',en:'Not enough gold.',ja:'所持金が足りません。'}[locale]:c.mp<template.mp?{ko:'MP가 부족합니다.',en:'Not enough MP.',ja:'MPが足りません。'}[locale]:{ko:'마나 부하가 높습니다.',en:'Mana strain is too high.',ja:'マナの負荷が高すぎます。'}[locale]} onClick={() => command('recontract', member.id)}>{t.renew} · {fee}G{template.mp ? ` · MP${template.mp}` : ''} · {realDuration(2, locale)}</ReasonButton>}
        </div>
        {member.condition === 'injured' && <p className="fr-muted">{t.treatment}</p>}
        <details><summary>{t.more}</summary><ReasonButton type="button" className="fr-btn" disabled={busy} onClick={() => command('dismiss', member.id)}>{t.dismiss}</ReasonButton></details>
      </article>;
    })}
    <p className="fr-muted">{t.missionHelp}</p>
    <ReasonButton type="button" className="fr-btn primary" disabled={busy || !active.length || kind === 'summons' && (c.mp < active.length * 2 || (c.mana?.strain ?? 0) >= 80)} reason={busy?undefined:!active.length?{ko:'임무에 나갈 건강한 동료를 편성하세요.',en:'Assign a healthy companion first.',ja:'任務に出る元気な仲間を編成してください。'}[locale]:c.mp<active.length*2?{ko:'MP가 부족합니다.',en:'Not enough MP.',ja:'MPが足りません。'}[locale]:{ko:'마나 부하가 높습니다.',en:'Mana strain is too high.',ja:'マナの負荷が高すぎます。'}[locale]} onClick={() => command('mission')}>{t.mission} · {realDuration(4, locale)}</ReasonButton>
    {(kind !== 'troop' || c.job === 'leader') && <details className="fr-card"><summary>{t.recruit}</summary>
      {!canHire && <p className="fr-muted">{{ ko: `고용·재계약에는 ${facility}가 필요합니다.`, en: `Recruitment and renewed agreements require a ${facility}.`, ja: `雇用・再契約には${facility}が必要です。` }[locale]}</p>}
      {FANTASY_COMPANIONS.filter(entry => !fantasyIsWorkerCompanion(entry.id) && entry.kind === kind && fantasyCompanionAvailable(c,entry.id) && !members.some(member => member.id === entry.id)).map(entry => <div className="fr-service-row" key={entry.id}>
        <span>{entry.names[locale]}<small>{entry.role[locale]} · {t.check} +{entry.check} · {t.guard} {entry.guard} · {realDuration(2, locale)}</small></span>
        <b>{entry.cost}G{entry.mp ? ` · MP${entry.mp}` : ''}</b>
        <ReasonButton type="button" className="fr-btn" disabled={busy || !canHire || members.length >= capacity || c.gold < entry.cost || c.mp < entry.mp || entry.mp > 0 && (c.mana?.strain ?? 0) >= 80} reason={busy?undefined:!canHire?t.unavailable:members.length>=capacity?{ko:'편성 가능한 인원이 가득 찼습니다.',en:'Your company is at capacity.',ja:'仲間の人数が上限です。'}[locale]:c.gold<entry.cost?{ko:'소지금이 부족합니다.',en:'Not enough gold.',ja:'所持金が足りません。'}[locale]:c.mp<entry.mp?{ko:'MP가 부족합니다.',en:'Not enough MP.',ja:'MPが足りません。'}[locale]:{ko:'마나 부하가 높습니다.',en:'Mana strain is too high.',ja:'マナの負荷が高すぎます。'}[locale]} onClick={() => command('hire', entry.id)}>{kind === 'summons' ? t.bind : t.hire}</ReasonButton>
      </div>)}
    </details>}
  </section>;
}


export function FantasyMagicPanel(props: Props) {
  return <FantasyRunicCircle {...props}/>;
}

export function FantasyAlchemyPanel({ c, onAction, blocked }: Props) {
  const [locale] = useLocale(); const connected = useStore(s => s.wsConnected);
  const workshop = fantasyBuildings(c).some(building => building.id === 'tower');
  const open = fantasyFacilityOpen('tower', c.hour);
  const t = {
    ko: { title: '연금 조합', only: '연금술사 전용 조합 메뉴입니다.', facility: '현재 지역에 마법사의 탑이 필요합니다.', inputs: '재료', output: '기본 결과', mix: '조합하기', missing: '재료가 부족합니다.', quality: '재료와 숙련이 품질을 좌우하며, 결과 등급은 조금 달라질 수 있습니다. 실패하면 첫 재료 1개를 잃습니다.' },
    en: { title: 'Alchemy mixtures', only: 'This mixture menu is for alchemists.', facility: 'A local mage tower is required.', inputs: 'Ingredients', output: 'Base result', mix: 'Mix', missing: 'Ingredients are missing.', quality: 'Materials and proficiency chiefly determine quality, with small grade variation. Failure loses one unit of the first ingredient.' },
    ja: { title: '錬金調合', only: '錬金術師専用の調合です。', facility: '現地の魔術師の塔が必要です。', inputs: '材料', output: '基本の結果', mix: '調合', missing: '材料が足りません。', quality: '品質は材料と熟練が中心で、等級には小さな差が出ます。失敗すると最初の材料を1個失います。' },
  }[locale];
  if (fantasyLifeJob(c) !== 'alchemist') return <p className="fr-muted">{t.only}</p>;
  const name = (id: string) => { const item = FANTASY_ITEMS.find(item => item.id === id); return item?.names?.[locale] ?? item?.name ?? id; };
  return <section className="fr-specialty"><FantasyAlchemySynthesis c={c} onAction={onAction} blocked={blocked}/><details className="fr-fold"><summary>{t.title}</summary>{!workshop && <p className="fr-muted">{t.facility}</p>}
    <p className="fr-muted">{t.quality}</p>
    {FANTASY_ALCHEMY_FORMULAS.map(formula => {
      const inputs = Object.entries(formula.inputs) as [string, number][];
      const enough = inputs.every(([id, count]) => (c.inventory[id] ?? 0) >= count);
      const known = fantasyAlchemyFormulaKnown(c, formula.id);
      return <details className="fr-card" key={formula.id}><summary>{known ? formula.names[locale] : fantasyAlchemyUnidentifiedFormulaName(formula.id, locale)} · {realDuration(3, locale)}</summary>
        <p>{t.inputs}: {inputs.map(([id, count]) => `${name(id)} ${c.inventory[id] ?? 0}/${count}`).join(' · ')}</p>
        {known ? <p>{t.output}: {name(formula.output)} ×1 · D12 / DC{Math.ceil(formula.dc*12/20)}</p> : <p className="fr-muted">{{ ko: '직접 합성에 성공하거나 정확한 배합을 책에서 배워야 결과를 알 수 있습니다.', en: 'Identify this result through successful synthesis or an exact recipe in a book.', ja: '合成に成功するか本で正確な配合を学ぶと、結果が分かります。' }[locale]}</p>}
        {!enough && <p className="fr-muted">{t.missing}</p>}
        <ReasonButton type="button" className="fr-btn primary" disabled={blocked || !connected || !workshop || !open || !enough} reason={blocked||!connected?undefined:!workshop?t.facility:!open?fantasyFacilityClosedText(locale):t.missing} onClick={() => onAction({ type: 'alchemy', formula: formula.id })}>{t.mix}</ReasonButton>
      </details>;
    })}</details>
  </section>;
}
