import type {FantasySkill} from './fantasy.ts';
export function fantasyManaRestorationSkill(skill:FantasySkill):FantasySkill{
  const entries:Record<string,{names:[string,string,string];power:number;mp:number}>={
    'job-mage-advanced-2':{names:['마나 명상','Mana Meditation','魔力の瞑想'],power:18,mp:0},
    'job-priest-advanced-4':{names:['정신 회복의 기도','Prayer of Renewal','精神回復の祈り'],power:22,mp:4},
    'job-bard-advanced-6':{names:['마음을 잇는 후렴','Restorative Refrain','心を結ぶリフレイン'],power:20,mp:5},
  };
  const e=entries[skill.id];if(!e)return skill;const[ko,en,ja]=e.names;
  const descriptions={ko:`MP를 ${e.power} 회복한다. 야외에서는 자신에게, 전투에서는 자신·아군에게 사용한다. 회복 간격 6시간, 전투당 한 번.`,en:`Restore ${e.power} MP. Self outside combat; self or an ally in battle. Six-hour shared recovery interval; once per battle.`,ja:`MPを${e.power}回復。戦闘外は自分、戦闘中は自分か味方が対象。回復の共通間隔は6時間、戦闘ごとに1回。`};
  return {...skill,names:{ko,en,ja},name:ja,descriptions,description:descriptions.ja,effect:'heal',restore:'mp',power:e.power,mp:e.mp};
}
