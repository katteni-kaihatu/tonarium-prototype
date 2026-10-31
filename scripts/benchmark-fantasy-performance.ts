import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { applyFantasyAction, newFantasyProfile } from '../shared/fantasy-engine.ts';
import { applyFantasyEconomyCommand, fantasyEconomyState, newFantasyEconomyLedger, validFantasyEconomyLedger } from '../shared/fantasy-economy.ts';

export function benchmarkFantasyEconomy(iterations = 8) {
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > 100) throw new Error('Iterations must be an integer from1 to100');
  const profile = applyFantasyAction(newFantasyProfile(), { type: 'create', name: 'Performance', source: 'human', gender: 'female' }, () => .7).profile;
  Object.assign(profile.character!, { location: 'hearth', hour: 12, job: 'warrior', gold: 100000, guildProgress: { version: 1, grade: 4, completedAtGrade: 0, creditedQuests: [] } });
  const profiles = new Map([['benchmark', profile]]), context = { hour: 12, peers: ['benchmark'], token: 'benchmark' };
  const ledger = applyFantasyEconomyCommand(newFantasyEconomyLedger(), profiles, 'benchmark', { type: 'sync' }, context).ledger;
  const cases = {
    sync: () => applyFantasyEconomyCommand(newFantasyEconomyLedger(), profiles, 'benchmark', { type: 'sync' }, context),
    view: () => fantasyEconomyState(ledger, profiles, 'benchmark', context),
    validate: () => validFantasyEconomyLedger(ledger),
  };
  const gc = (globalThis as typeof globalThis & { gc?: () => void }).gc;
  gc?.();
  const before = process.memoryUsage();
  const scenarios = Object.fromEntries(Object.entries(cases).map(([name, run]) => {
    run();
    const samplesMs: number[] = []; let result: unknown;
    for (let index = 0; index < iterations; index++) {
      const started = performance.now(); result = run(); samplesMs.push(performance.now() - started);
    }
    const sorted = [...samplesMs].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
    const medianMs = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
    return [name, { medianMs, samplesMs, signature: createHash('sha256').update(JSON.stringify(result)).digest('hex') }];
  }));
  gc?.();
  return { node: process.version, iterations, gcAvailable: !!gc, scenarios, memory: { before, after: process.memoryUsage(), maxRssKiB: process.resourceUsage().maxRSS } };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    const args = process.argv.slice(2);
    if (args.some(arg => !/^--(?:iterations|output)=.+$/.test(arg))) throw new Error('Usage: --iterations=8 --output=work/qa/fantasy-performance/report.json');
    const iterations = args.find(arg => arg.startsWith('--iterations='))?.slice('--iterations='.length);
    const output = args.find(arg => arg.startsWith('--output='))?.slice('--output='.length);
    const report = benchmarkFantasyEconomy(iterations === undefined ? 8 : Number(iterations));
    const text = JSON.stringify(report, null, 2) + '\n';
    if (output) { fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, text); }
    process.stdout.write(text);
  } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
}
