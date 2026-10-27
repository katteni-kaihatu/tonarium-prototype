import { ReasonButton } from './FantasyActionButton.tsx';
import type { FantasyAction, FantasyProfile } from '../../../shared/fantasy.ts';
import { FANTASY_JOBS, FANTASY_RACES } from '../../../shared/fantasy-data.ts';
import { FANTASY_TERMS } from '../../../shared/fantasy-lore.ts';
import { useStore } from '../store.ts';
import { useLocale } from '../locale.ts';
import { gameClock } from './fantasy-copy.ts';

export function FantasyLegacy({profile,death=false,onAction,blocked=false}:{profile:FantasyProfile;death?:boolean;onAction:(action:FantasyAction)=>void;blocked?:boolean}) {
  const [locale]=useLocale();
  const records=useStore(s=>s.fantasyLegacies);
  const t={ko:{title:'세계에 남은 발자취',death:'한 생의 끝',body:'구조의 손길이 닿지 못했습니다. 당신의 여정은 이 세계에 남습니다.',new:'새로운 삶 시작',empty:'아직 전해지는 발자취가 없습니다.',visited:'방문',quests:'완료한 의뢰',unknown:'알려지지 않은 곳',own:'이전의 삶'},en:{title:'Footprints in the world',death:'A life has ended',body:'Help could not reach you. Your journey remains part of this world.',new:'Begin a new life',empty:'No footprints have been recorded yet.',visited:'Places visited',quests:'Quests completed',unknown:'An unknown place',own:'Past lives'},ja:{title:'世界に残る足跡',death:'ひとつの生の終わり',body:'救いの手は届きませんでした。あなたの旅はこの世界に残ります。',new:'新しい人生を始める',empty:'まだ伝わる足跡はありません。',visited:'訪問地',quests:'達成した依頼',unknown:'知られざる場所',own:'過去の人生'}}[locale];
  const place=(id:string|null)=>id==='sea'?{ko:'해상',en:'At sea',ja:'海上'}[locale]:FANTASY_TERMS.find(term=>term.id===id&&term.category==='place')?.names[locale]??t.unknown;
  const job=(id:string)=>FANTASY_JOBS.find(job=>job.id===id)?.names[locale]??id;
  return <section className={death?'fr-death':'fr-legacy'}>
    {death&&<><div className="fr-ornament">✦</div><h1>{t.death}</h1><p>{profile.character?.name}</p><p>{t.body}</p><ReasonButton className="fr-btn primary" disabled={blocked} onClick={()=>onAction({type:'rebirth'})}>{t.new} →</ReasonButton></>}
    <h2>{t.title}</h2>{!records.length&&!(profile.pastLives?.length)&&<p>{t.empty}</p>}
    {!!profile.pastLives?.length&&<details><summary>{t.own} · {profile.pastLives.length}</summary>{[...profile.pastLives].reverse().map(life=><article className="fr-card" key={life.generation}><h3>{life.name}</h3><p>{FANTASY_RACES.find(r=>r.id===life.race)?.names[locale]} · {job(life.job)} · Lv. {life.level}</p><small>{t.visited} {life.visited.length} · {t.quests} {life.completed.length}</small></article>)}</details>}
    {records.map(record=><article className="fr-card" key={record.id}><h3>{record.name}</h3><p>{job(record.job)} · Lv. {record.level}</p><small>{place(record.location)} · {gameClock(record.hour,locale)}<br/>{t.visited} {record.visitedCount} · {t.quests} {record.questCount}</small></article>)}
  </section>;
}
