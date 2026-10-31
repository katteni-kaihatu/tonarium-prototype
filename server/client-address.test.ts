import test from 'node:test';
import assert from 'node:assert/strict';
import type { IncomingMessage } from 'node:http';
import { createClientAddress } from './client-address.ts';
const request = (address: string, forwarded?: string) => ({socket:{remoteAddress:address},headers:forwarded?{'x-forwarded-for':forwarded}:{}} as IncomingMessage);
test('untrusted clients cannot choose their guest-rate-limit address',()=>{
  const address=createClientAddress({trustProxy:true,trustedProxyAddresses:['172.18.0.2']});
  assert.equal(address(request('198.51.100.4','127.0.0.1')),'198.51.100.4');
  assert.equal(address(request('172.18.0.3','127.0.0.1')),'172.18.0.3');
});
test('trusted loopback, bridge and IPv6 proxies use the final valid forwarded address',()=>{
  const address=createClientAddress({trustProxy:true,trustedProxyAddresses:['172.18.0.0/16','2001:db8::/32']});
  for(const remote of ['127.0.0.1','::ffff:127.0.0.1','172.18.0.2','2001:db8::2'])
    assert.equal(address(request(remote,'203.0.113.9, ::ffff:198.51.100.8')),'198.51.100.8');
  assert.equal(address(request('172.18.0.2','198.51.100.8, invalid')),'172.18.0.2');
  assert.equal(address(request('2001:0db8:0:0:0:0:0:2','2001:0db8::8')),'2001:db8::8');
});
test('invalid proxy ranges and global trust never trust public clients',()=>{
  const address=createClientAddress({trustedProxyAddresses:['0.0.0.0/0','::/0','172.18.0.0/33','172.18.*','*','172.18.0.2\n']});
  assert.equal(address(request('172.18.0.2','127.0.0.1')),'172.18.0.2');
});
