import test from 'node:test';
import assert from 'node:assert/strict';
import { fantasyPlatformAuthorized } from './fantasy-platform-auth.ts';
test('only the authenticated Tonarium account owns a fantasy connection',()=>{
  for(const kind of ['misskey','guest','dev'] as const)assert.equal(fantasyPlatformAuthorized({id:'platform-id',kind},'platform-id','fantasy'),true);
  assert.equal(fantasyPlatformAuthorized(null,'victim','fantasy'),false);
  assert.equal(fantasyPlatformAuthorized({id:'owner'},'victim','fantasy'),false);
  assert.equal(fantasyPlatformAuthorized({id:'owner'},null,'fantasy'),false);
  assert.equal(fantasyPlatformAuthorized({id:'owner'},'owner','city'),false);
  assert.equal(fantasyPlatformAuthorized({id:'owner'},'owner',undefined),false);
});

test('browser cross-origin sockets cannot reuse platform cookies', async()=>{
  const { platformSocketOriginAllowed }=await import('./fantasy-platform-auth.ts');
  assert.equal(platformSocketOriginAllowed('https://game.example','https://game.example',undefined),true);
  assert.equal(platformSocketOriginAllowed(undefined,'https://game.example',undefined),true);
  assert.equal(platformSocketOriginAllowed('null','https://game.example',undefined),false);
  assert.equal(platformSocketOriginAllowed('https://evil.example','https://game.example',undefined),false);
  assert.equal(platformSocketOriginAllowed('https://game.example','https://game.example','cross-site'),false);
});
