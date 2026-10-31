import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRequire } from 'node:module';
import { applyFantasyAction, newFantasyProfile } from '../../../shared/fantasy-engine.ts';
import { applyFantasyDungeonAction, fantasyDungeonSiteFor } from '../../../shared/fantasy-dungeon.ts';
const require = createRequire(import.meta.url), react = require('react') as typeof import('react');
const original = react.useSyncExternalStore;
react.useSyncExternalStore = (subscribe, snapshot) => original(subscribe, snapshot, snapshot);
const socket = require.resolve('../net/ws.ts');
require.cache[socket] = { id: socket, filename: socket, loaded: true, exports: { send: () => {} } } as NodeModule;
const { FantasyDungeonActions } = require('./FantasyDungeonPanel.tsx') as typeof import('./FantasyDungeonPanel.tsx');
const { setLocale } = require('../locale.ts') as typeof import('../locale.ts');
const { set } = require('../store.ts') as typeof import('../store.ts');

test('dungeon UI explains secured camp and presents unrepeated room choices in KO EN JA', () => {
  let p = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', name: 'Digger', gender: 'female' }, () => .5).profile;
  p.character!.location = 'oldwatch'; p.character!.visited.push('oldwatch');
  p = applyFantasyDungeonAction(p, { type: 'dungeonEnter', site: 'oldwatch' }, () => .5).profile;
  const c = p.character!, room = fantasyDungeonSiteFor(c, 'oldwatch')!.rooms.find(room => room.special)!;
  c.dungeon!.active!.room = room.id; c.dungeon!.sites.oldwatch.revealed.push(room.id); c.inventory.herb = 1;
  for (const locale of ['ko', 'en', 'ja'] as const) {
    setLocale(locale); set({ fantasyProfile: p, fantasyParty: null, wsConnected: true });
    const render = () => renderToStaticMarkup(createElement(FantasyDungeonActions, { c, blocked: false, onAction: () => {} }));
    const html = render();
    assert.ok(html.includes(({ ko: '손대기', en: 'Touch', ja: '触れる' })[locale]));
    assert.ok(html.includes(({ ko: '약초 바치기', en: 'Offer an herb', ja: '薬草を供える' })[locale]));
    assert.ok(html.includes(({ ko: '지나치기', en: 'Leave it alone', ja: '立ち去る' })[locale]));
    assert.ok(html.includes(({ ko: '야영 전에 방의 안전을 조사하세요.', en: 'Inspect the room before making camp.', ja: '野営する前に部屋の安全を調べてください。' })[locale]));
    c.dungeon!.sites.oldwatch.inspected = [room.id];
    assert.ok(render().includes(({ ko: '확보한 방에서 야영', en: 'Camp in this secured room', ja: '確保した部屋で野営' })[locale]));
    c.dungeon!.sites.oldwatch.claimed = [room.id];
    assert.ok(!render().includes(`>${({ ko: '약초 바치기', en: 'Offer an herb', ja: '薬草を供える' })[locale]}</button>`));
    c.dungeon!.sites.oldwatch.inspected = []; c.dungeon!.sites.oldwatch.claimed = [];
  }
});
