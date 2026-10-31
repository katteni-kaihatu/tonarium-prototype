import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { FantasyCombatContributionDetails } from './FantasyCombatContributionDetails.tsx';
import { createFantasyCombat } from '../../../shared/fantasy-combat.ts';
const names={ko:'치유사',en:'Healer',ja:'治療役'},stats={hp:100,mp:100,attack:10,defense:10,agility:10,intelligence:10,accuracy:90,magicResist:10};
const battle=()=>createFantasyCombat({id:'result',source:'hunt:monster-forest-wolf',location:'greenwood',hour:12,seed:42,players:[{id:'p',userId:'u',generation:1,names,stats,hp:100,mp:100,position:'front',range:'melee',skills:[]}],enemies:[{id:'e',template:'monster-forest-wolf'}]});
test('optional closed results show localized role receipts with no aggregate ranking',()=>{
 for(const [locale,title] of [['ko','파티 기여'],['en','Party contribution'],['ja','パーティ貢献']] as const){const state=battle();state.status='victory';state.fighters[0].contribution.receipts={healing:73,protection:22,control:1};const html=renderToStaticMarkup(<FantasyCombatContributionDetails battle={state} locale={locale}/>);assert.ok(html.includes(title));assert.ok(html.includes('73'));assert.ok(html.includes('22'));assert.ok(!html.includes(' open='));assert.ok(!html.includes('undefined'));}
});
test('active and legacy battles do not show empty new result controls',()=>{
 const state=battle();assert.equal(renderToStaticMarkup(<FantasyCombatContributionDetails battle={state} locale="en"/>),'');state.status='victory';assert.equal(renderToStaticMarkup(<FantasyCombatContributionDetails battle={state} locale="en"/>),'');
});
