import assert from 'node:assert/strict';
import type { IncomingMessage } from 'node:http';
import test from 'node:test';
import { requestOrigin } from './auth.ts';

function request(headers: IncomingMessage['headers']): IncomingMessage {
  return { headers } as IncomingMessage;
}

test('requestOrigin preserves a same-host HTTPS browser origin behind an HTTP proxy hop', () => {
  assert.equal(requestOrigin(request({
    host: 'game.example',
    origin: 'https://game.example',
    'x-forwarded-host': 'game.example',
    'x-forwarded-proto': 'http',
  })), 'https://game.example');
});

test('requestOrigin does not trust the scheme from a different browser origin', () => {
  assert.equal(requestOrigin(request({
    host: 'game.example',
    origin: 'https://evil.example',
    'x-forwarded-host': 'game.example',
    'x-forwarded-proto': 'http',
  })), 'http://game.example');
});
