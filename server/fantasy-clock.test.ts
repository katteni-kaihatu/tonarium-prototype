import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FantasyClock } from './fantasy-clock.ts';
import { FANTASY_WORLD_TIME_RATE } from '../shared/fantasy.ts';

function temporary(t: { after: (fn: () => void) => void }) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tonarium-world-clock-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return path.join(directory, 'fantasy-clock.json');
}

test('one persistent world clock advances at the fixed rate of thirty game minutes per real minute', t => {
  const file = temporary(t);
  let now = 1_000_000;
  const clock = new FantasyClock(file, { now: () => now, initialHour: 40 });
  assert.equal(clock.error, undefined);
  assert.equal(clock.snapshot().hour, 40);
  assert.equal(clock.snapshot().rate, 30);
  assert.equal(FANTASY_WORLD_TIME_RATE, 30);
  now += 60_000;
  assert.equal(clock.snapshot().hour, 40.5);
  now += 60_000;
  assert.equal(clock.snapshot().hour, 41);
  assert.deepEqual(clock.snapshot(), { hour: 41, rate: 30, serverTime: now });
  const reloaded = new FantasyClock(file, { now: () => now, initialHour: 8 });
  assert.deepEqual(reloaded.snapshot(), clock.snapshot());
  now += 48 * 60_000;
  assert.equal(reloaded.snapshot().hour, 65);
});

test('clock checkpoints are atomic, preserve downtime and never move backward after a wall-clock correction', t => {
  const file = temporary(t);
  let now = 1_000_000;
  const clock = new FantasyClock(file, { now: () => now });
  now += 120_000;
  clock.checkpoint();
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).hour, 9);
  now -= 60_000;
  assert.equal(clock.snapshot().hour, 9);
  clock.checkpoint(true);
  const reloaded = new FantasyClock(file, { now: () => now });
  assert.equal(reloaded.snapshot().hour, 9);
  assert.deepEqual(fs.readdirSync(path.dirname(file)), ['fantasy-clock.json']);
});

test('a corrupt world clock is preserved and cannot silently restart the world', t => {
  const file = temporary(t);
  for (const text of ['{broken', JSON.stringify({ version: 2, hour: 8, wallTime: 0 }), JSON.stringify({ version: 1, hour: -1, wallTime: 0 })]) {
    fs.writeFileSync(file, text);
    const clock = new FantasyClock(file, { onError: () => {} });
    assert.ok(clock.error);
    clock.checkpoint(true);
    assert.equal(fs.readFileSync(file, 'utf8'), text);
  }
});

test('a failed checkpoint blocks gameplay until saving succeeds without resetting time or pace', t => {
  const file = temporary(t);
  let now = 1_000_000;
  let fail = false;
  const clock = new FantasyClock(file, { now: () => now, onError: () => {}, save: (target, text) => {
    if (fail) throw new Error('disk full');
    fs.writeFileSync(target, text);
  } });
  const initial = fs.readFileSync(file, 'utf8');
  now += 60_000; fail = true;
  clock.checkpoint();
  assert.ok(clock.error);
  assert.equal(fs.readFileSync(file, 'utf8'), initial);
  assert.equal(clock.snapshot().hour, 8.5);
  fail = false; clock.checkpoint();
  assert.equal(clock.error, undefined);
  assert.equal(new FantasyClock(file, { now: () => now }).snapshot().hour, 8.5);
});
