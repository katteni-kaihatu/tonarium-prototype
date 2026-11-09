import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { battlefieldPlaytest, delay, until } from '../server/battlefield-playtest.ts';

const seconds = Number(process.argv[2] ?? 60);
if (!Number.isFinite(seconds) || seconds < 10 || seconds > 600) throw new Error('Duration must be 10–600 seconds');
const results = [];
for (const [humans, bots] of [[8, 0], [2, 6]]) {
  const cleanup: (() => unknown)[] = [];
  const server = await battlefieldPlaytest({ after: fn => { cleanup.push(fn as () => unknown); } }, { benchmark: true });
  try {
    const peers = [await server.peer(`bench-${humans}-0`)];
    for (let i = 1; i < humans; i++) peers.push(await server.peer(`bench-${humans}-${i}`, peers[0].sid));
    for (let i = 0; i < bots; i++) await peers[0].send({ t: 'battleBot', action: 'add' });
    await until(() => Object.values(peers[0].state?.actors ?? {}).length === humans + bots ? true : undefined);
    const baseline = peers.map(p => p.traffic()), errorBaseline = server.errors();
    const start = Date.now(), end = start + seconds * 1000;
    let step = 0, commands = 0, sendErrors = 0;
    while (Date.now() < end) {
      const phase = Math.floor(step / 40) % 4;
      await Promise.all(peers.map(async (peer, index) => {
        const angle = phase * Math.PI / 2 + (index % 2 ? Math.PI : 0);
        try { await peer.send({ t: 'battleInput', input: { x: Math.sin(angle), z: Math.cos(angle), aim: Math.atan2(-Math.sin(angle), -Math.cos(angle)), fire: true } }); commands++; }
        catch { sendErrors++; }
      }));
      step++; await delay(50);
    }
    const measuredDurationMs = Date.now() - start;
    const samples = server.metrics.filter(m => m.at >= start && m.at <= end).map(m => m.durationMs).sort((a, b) => a - b);
    const inputs = server.inputMetrics.filter(m => m.at >= start && m.at <= end);
    const inputSamples = inputs.map(m => m.durationMs).sort((a, b) => a - b);
    if (!samples.length || !inputs.length) throw new Error('Missing server timing samples');
    let mismatches = 0, comparedRevisions = 0;
    for (const [revision, serialized] of peers[0].versions) {
      const hash = createHash('sha256').update(serialized).digest('hex');
      for (const peer of peers.slice(1)) {
        const other = peer.versions.get(revision); if (!other) continue;
        comparedRevisions++;
        if (createHash('sha256').update(other).digest('hex') !== hash) mismatches++;
      }
    }
    const traffic = peers.map((p, i) => {
      const value = p.traffic(), old = baseline[i];
      return { receivedBytes: value.receivedBytes - old.receivedBytes, sentBytes: value.sentBytes - old.sentBytes, errors: value.errors - old.errors, inconsistencies: value.inconsistencies - old.inconsistencies };
    });
    if (!comparedRevisions) throw new Error('No shared authoritative revisions available for comparison');
    results.push({ humans, bots, durationMs: measuredDurationMs, commands, tickSamples: samples.length,
      updateMs: { mean: samples.reduce((a, b) => a + b, 0) / samples.length, p95: samples[Math.floor(samples.length * .95)], max: samples.at(-1) },
      inputSamples: inputs.length, rejectedInputs: inputs.filter(m => !m.accepted).length,
      inputValidationMs: { mean: inputSamples.reduce((a, b) => a + b, 0) / inputs.length, p95: inputSamples[Math.floor(inputs.length * .95)], max: inputSamples.at(-1), total: inputSamples.reduce((a, b) => a + b, 0) },
      traffic, sendErrors, serverErrors: server.errors() - errorBaseline, comparedRevisions, mismatches });
    for (const peer of peers) { await peer.send({ t: 'battleInput', input: { x: 0, z: 0, aim: 0, fire: false } }); peer.home.close(); }
    for (const peer of peers) peer.home.terminate();
  } finally { for (const fn of cleanup.reverse()) await fn(); }
}
console.log(JSON.stringify({ command: `npm run benchmark:battlefield -- ${seconds}`, environment: { node: process.version, platform: process.platform, release: os.release(), cpu: os.cpus()[0]?.model },
    revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), workingTree: 'includes current uncommitted changes', seed: 123456789,
    map: 'battlefield', inputPeriodMs: 50, byteScope: 'WebSocket payload bytes; excludes WebSocket/TLS/TCP headers',
    timingScope: 'updateMs: server update, bot validation and broadcast submission; inputValidationMs: authenticated human command validation and registration, including rejected dead inputs; transport delivery time excluded',
    consistencyCheck: 'SHA-256 equality of identical authoritative revisions received by different peers', results }, null, 2));
