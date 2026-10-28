import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveDialogueBackend } from '../server/kokoa-ai-config.ts';
import { NpcChat } from '../server/npc.ts';
import { FantasyGmChat } from '../server/fantasy-gm-chat.ts';
import { applyFantasyAction, newFantasyProfile } from '../shared/fantasy-engine.ts';

export async function checkKokoaAi({ env = process.env, fetcher = fetch, generate = false, report = console.log }: { env?: NodeJS.ProcessEnv; fetcher?: typeof fetch; generate?: boolean; report?: (value: string) => void } = {}): Promise<boolean> {
  const config = resolveDialogueBackend({}, env);
  if (!config.endpoint || !config.apiKey) { report(JSON.stringify({ ok: false, stage: 'configuration', reason: 'KOKOAAI settings missing or invalid' })); return false; }
  try {
    const response = await fetcher(config.endpoint.replace(/\/chat\/completions$/, '/models'), { headers: { Authorization: `Bearer ${config.apiKey}` }, redirect: 'error', signal: AbortSignal.timeout(10000) });
    if (!response.ok) { await response.body?.cancel(); report(JSON.stringify({ ok: false, stage: 'models', status: response.status })); return false; }
    const value = await response.json() as { data?: { id?: string }[] };
    const found = Array.isArray(value.data) && value.data.some(model => model.id === config.model);
    report(JSON.stringify({ ok: found, stage: 'models', model: config.model, modelFound: found }));
    if (!found || !generate) return found;
    const questions = {
      ko: '친구 미나와 다퉜어. 사과의 첫마디를 어떻게 꺼내면 좋을까?',
      en: 'I argued with my friend Mina. How should I start an apology?',
      ja: '友達のミナと喧嘩したんだ。謝るときは何と言えばいい？',
    };
    let ok = true;
    for (const locale of ['ko', 'en', 'ja'] as const) for (const kind of ['npc', 'gm'] as const) {
      const profile = applyFantasyAction(newFantasyProfile(), { type: 'create', name: 'Probe', source: 'human', gender: 'female' }, () => .5).profile;
      const request = { requestId: `probe-${locale}-${kind}`, text: questions[locale], locale };
      const options = { env, fetch: fetcher, onError: () => {} };
      const started = performance.now();
      const reply = kind === 'npc'
        ? await new NpcChat(options).chat(request.requestId, { ...request, npcId: 'rin' }, { character: profile.character! })
        : await new FantasyGmChat(options).chat(request.requestId, request, { session: 'synthetic-probe', world: 'fantasy', profile });
      const answer = 'text' in reply ? reply.text : reply.reply.text;
      const valid = !reply.error && reply.source === 'local' && !!answer;
      ok &&= valid;
      report(JSON.stringify({ ok: valid, stage: 'generation', kind, locale, model: reply.model, elapsedMs: Math.round(performance.now() - started), error: reply.error, answer }));
    }
    return ok;
  } catch { report(JSON.stringify({ ok: false, stage: 'request', reason: 'KokoaAI request failed' })); return false; }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.slice(2).some(argument => argument !== '--generate')) { console.error('Usage: check:kokoa-ai [--generate]'); process.exitCode = 1; }
  else if (!await checkKokoaAi({ generate: process.argv.includes('--generate') })) process.exitCode = 1;
}
