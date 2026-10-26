import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copySessionLink, sessionIdFromUrl, sessionUrl } from './session-links.ts';
import { canSeeSession } from './home.ts';
import type { Group, SessionDef } from './protocol.ts';

test('shared URL round trips IDs and excludes runtime query values', () => {
  for (const id of ['room', '日本語 /?#%', 'a:b']) {
    const url = sessionUrl(id, 'https://example.test/?as=another#/market/item');
    assert.equal(sessionIdFromUrl(url), id);
    assert.ok(url.startsWith('https://example.test/#/session/'));
    assert.ok(!url.includes('as='));
  }
  for (const url of ['invalid', 'https://example.test/', 'https://example.test/#/market/a', 'https://example.test/#/session/', 'https://example.test/#/session/%ZZ']) {
    assert.equal(sessionIdFromUrl(url), null);
  }
});

test('copy waits for clipboard success and reports rejection or missing API once', async () => {
  const results: boolean[] = [];
  const writes: string[] = [];
  let finish!: () => void;
  const pending = copySessionLink('target', 'https://example.test', async (url) => {
    writes.push(url);
    await new Promise<void>((resolve) => { finish = resolve; });
  }, (ok) => results.push(ok));
  assert.deepEqual([...results], []);
  finish();
  await pending;
  assert.deepEqual(writes, ['https://example.test/#/session/target']);
  assert.deepEqual([...results], [true]);
  await copySessionLink('target', 'https://example.test', async () => { throw new Error('denied'); }, (ok) => results.push(ok));
  await copySessionLink('target', 'https://example.test', () => { throw new TypeError('unavailable'); }, (ok) => results.push(ok));
  assert.deepEqual([...results], [true, false, false]);
});

test('a shared ID confers no visibility or participation entitlement', () => {
  const groups: Group[] = [{ id: 'team', name: 'Team', owner: 'member', color: '#000', members: ['member'], channels: [] }];
  for (const visibility of ['public', 'friends', 'group', 'groupPlus', 'invite'] as const) {
    const session: SessionDef = { id: 'target', name: 'Private', owner: 'owner', visibility, group: 'team', invited: ['invited'] };
    const sharedId = sessionIdFromUrl(sessionUrl(session.id, 'https://example.test'));
    assert.equal(sharedId, session.id);
    assert.equal(canSeeSession(session, 'stranger', [], groups, []), visibility === 'public');
    assert.equal(canSeeSession(session, 'owner', [], groups, []), true);
    assert.equal(canSeeSession(session, 'invited', [], groups, []), true);
    assert.equal(canSeeSession(session, 'member', [], groups, []), ['public', 'group', 'groupPlus'].includes(visibility));
    assert.equal(canSeeSession(session, 'friend', ['owner', 'member'], groups, []), ['public', 'friends', 'groupPlus'].includes(visibility));
  }
});
