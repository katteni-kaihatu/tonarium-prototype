import test from 'node:test';import assert from 'node:assert/strict';
import {createElement}from'react';import{renderToStaticMarkup}from'react-dom/server';import{createRequire}from'node:module';
import{applyFantasyAction,newFantasyProfile}from'../../../shared/fantasy-engine.ts';
const require=createRequire(import.meta.url),react=require('react')as typeof import('react'),original=react.useSyncExternalStore;react.useSyncExternalStore=(subscribe,snapshot)=>original(subscribe,snapshot,snapshot);
const{FantasyCampOptions}=require('./FantasyCampOptions.tsx')as typeof import('./FantasyCampOptions.tsx');const{setLocale}=require('../locale.ts')as typeof import('../locale.ts');const{set}=require('../store.ts')as typeof import('../store.ts');
test('camp options offer individual watch opt-in and explain recovery and real partner requirements in KO EN JA',()=>{
 const p=applyFantasyAction(newFantasyProfile(),{type:'create',source:'human',name:'Camper',gender:'female'},()=>.5).profile;
 for(const locale of ['ko','en','ja']as const){setLocale(locale);set({fantasyProfile:p,wsConnected:true});const html=renderToStaticMarkup(createElement(FantasyCampOptions,{c:p.character!,blocked:false,onAction:()=>{}}));assert.ok(html.includes('type="checkbox"'));assert.ok(html.includes('25%'));assert.ok(html.includes(({ko:'교대 망보기 참여',en:'Join the rotating watch',ja:'交代の見張りに参加'})[locale]));assert.ok(html.includes(({ko:'야영 시작',en:'Make camp',ja:'野営を始める'})[locale]));assert.ok(!html.includes('checked=""'));}
});
