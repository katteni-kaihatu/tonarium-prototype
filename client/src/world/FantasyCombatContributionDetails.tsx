import type { NpcLocale } from '../../../shared/npc.ts';
import type { FantasyCombatState } from '../../../shared/fantasy-combat.ts';
import { fantasyCombatContributionTotals, type FantasyCombatReceipt } from '../../../shared/fantasy-combat-contribution.ts';
const labels:Record<string,Record<NpcLocale,string>>={
 title:{ko:'파티 기여',en:'Party contribution',ja:'パーティ貢献'},
 note:{ko:'실제 회복·방어·방해 효과. 소환수와 동료의 기여를 포함해요.',en:'Actual recovery, protection and interference. Includes owned companions and summons.',ja:'実際の回復・防御・妨害。配下と召喚の貢献を含みます。'},
 damage:{ko:'피해',en:'Damage',ja:'ダメージ'},healing:{ko:'HP 회복',en:'HP restored',ja:'HP回復'},mana:{ko:'MP 회복',en:'MP restored',ja:'MP回復'},protection:{ko:'피해 방지',en:'Damage prevented',ja:'被害防止'},control:{ko:'유효 방해',en:'Effective control',ja:'有効な妨害'},assistance:{ko:'피해 지원',en:'Damage assisted',ja:'攻撃支援'},rescue:{ko:'소생·구명',en:'Revived / saved',ja:'蘇生・救命'},
};
const shown:FantasyCombatReceipt[]=['damage','healing','mana','protection','control','assistance','rescue'];
export function FantasyCombatContributionDetails({battle,locale}:{battle:FantasyCombatState;locale:NpcLocale}){
 const participants=battle.fighters.filter(f=>f.userId&&f.generation);
 if(battle.status==='active'||!participants.some(f=>f.contribution.receipts||(battle.units??[]).some(u=>u.companion?.ownerId===f.userId&&u.contribution.receipts)))return null;
 return <details className="fr-combat-contribution"><summary>{labels.title[locale]}</summary><p>{labels.note[locale]}</p><ul>{participants.map(f=>{const totals=fantasyCombatContributionTotals(battle,f.userId!,f.generation!);return <li key={f.id}><strong>{f.names[locale]}</strong><dl>{shown.filter(kind=>totals[kind]>0).map(kind=><div key={kind}><dt>{labels[kind][locale]}</dt><dd>{totals[kind]}</dd></div>)}</dl></li>;})}</ul></details>;
}
