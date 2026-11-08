import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Battlefields } from '../server/battlefield.ts';
import { BATTLEFIELD, battleClear } from '../shared/battlefield.ts';

const results = [];
for (const [humans, bots] of [[8, 0], [2, 6]]) {
  let now = 10000, seed = 123456789, bytes = 0, errors = 0, mismatches = 0;
  const samples: number[] = [];
  const members = Array.from({ length: humans }, (_, i) => ({ id: `human-${i}` }));
  const battles = new Battlefields({ now: () => now, random: () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 0x100000000; }, members: () => members,
    owner: () => members[0].id, solids: () => [...BATTLEFIELD.solids], publish: (_sid, state) => {
      const payload = JSON.stringify(state); bytes += Buffer.byteLength(payload) * humans;
      for (let i = 0; i < humans; i++) if (JSON.stringify(JSON.parse(payload)) !== payload) mismatches++;
      for (const actor of Object.values(state.actors)) if (!Number.isFinite(actor.hp) || !battleClear(actor, actor, BATTLEFIELD.radius, [...BATTLEFIELD.solids])) errors++;
    } });
  battles.ensure('bench');
  for (let i = 0; i < bots; i++) battles.command('bench', members[0].id, { t: 'battleBot', action: 'add' });
  bytes = 0;
  const started = performance.now();
  for (let step = 0; step < 1200; step++) {
    now += 50;
    const at = performance.now();
    for (let i = 0; i < humans; i++) {
      const angle = Math.floor(step / 40) % 4 * Math.PI / 2 + (i % 2 ? Math.PI : 0);
      const actor = battles.state('bench')!.actors[members[i].id];
      const accepted = battles.command('bench', members[i].id, { t: 'battleInput', input: { x: Math.sin(angle), z: Math.cos(angle), aim: Math.atan2(-Math.sin(angle), -Math.cos(angle)), fire: true } });
      if (actor.alive && !accepted) errors++;
    }
    battles.update('bench'); samples.push(performance.now() - at);
  }
  samples.sort((a, b) => a - b);
  results.push({ humans, bots, simulatedMs: 60000, elapsedMs: performance.now() - started, updates: samples.length,
    updateMs: { mean: samples.reduce((a, b) => a + b, 0) / samples.length, p95: samples[Math.floor(samples.length * .95)], max: samples.at(-1) }, jsonPayloadBytesAllRecipients: bytes, errors, serializationMismatches: mismatches });
}
console.log(JSON.stringify({ scope: 'Core only: validation, updates and JSON serialization. Authentication, encryption, sockets, database and client rendering excluded.',
  command: 'node --experimental-transform-types scripts/benchmark-battlefield-core.ts', environment: { node: process.version, platform: process.platform, release: os.release(), cpu: os.cpus()[0]?.model },
  revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(), workingTree: 'includes current uncommitted changes',
  modelSha256: createHash('sha256').update(readFileSync('shared/battlefield.ts')).update(readFileSync('server/battlefield.ts')).digest('hex'), seed: 123456789, map: 'battlefield', inputPeriodMs: 50, results }, null, 2));
