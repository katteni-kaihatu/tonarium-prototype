import type { FantasyAction, FantasyProfile } from '../../../shared/fantasy.ts';
import { FANTASY_MIRACLES } from '../../../shared/fantasy-miracle-catalog.ts';
import { fantasyIsSaint } from '../../../shared/fantasy-miracles.ts';
import { fantasyBuildings } from '../../../shared/fantasy-town.ts';
import { useLocale } from '../locale.ts';
import { ReasonButton } from './FantasyActionButton.tsx';

export function FantasyMiraclePreparation({profile,blocked,onAction}:{profile:FantasyProfile;blocked:boolean;onAction:(action:FantasyAction)=>void}){
  const [locale]=useLocale(),c=profile.character;
  if(!c||!fantasyIsSaint(c))return null;
  const say=(ko:string,en:string,ja:string)=>({ko,en,ja})[locale];
  const learned=FANTASY_MIRACLES.filter(entry=>c.miracles?.learned.includes(entry.id)),prepared=c.miracles?.prepared??[];
  const temple=fantasyBuildings(c).some(b=>b.id==='temple')&&c.hour%24>=6&&c.hour%24<18;
  return <section className="fr-card"><h3>{say('준비한 기적','Prepared miracles','準備した奇跡')} · {prepared.length}/3</h3>
    {!learned.length&&<p>{say('아직 깨달은 기적이 없습니다.','You have not discovered a miracle yet.','まだ悟った奇跡はありません。')}</p>}
    {learned.map(entry=>{const selected=prepared.includes(entry.id),full=!selected&&prepared.length>=3;
      const reason=!temple?say('낮에 신전을 방문해 준비할 수 있습니다.','Prepare miracles at a temple during the day.','昼に神殿で準備できます。'):full?say('기적은 세 개까지만 준비할 수 있습니다.','You can prepare at most three miracles.','準備できる奇跡は三つまでです。'):blocked?say('현재 행동이나 요청을 먼저 마쳐 주세요.','Finish the current activity or request first.','いまの行動や依頼を先に終えてください。'):undefined;
      return <article key={entry.id}><b>{entry.names[locale]}</b><p>{entry.descriptions[locale]}</p><ReasonButton className="fr-btn" aria-pressed={selected} disabled={blocked||!temple||full} reason={reason} onClick={()=>onAction({type:'miraclePrepare',miracles:selected?prepared.filter(id=>id!==entry.id):[...prepared,entry.id]})}>{selected?say('준비 해제','Unprepare','準備を外す'):say('준비','Prepare','準備する')}</ReasonButton></article>;
    })}
  </section>;
}
