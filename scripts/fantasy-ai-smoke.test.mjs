import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import * as smoke from './fantasy-ai-smoke.mjs';

const { runCommand, runSmoke } = smoke;

const reply = (body, status = 200) => `${JSON.stringify(body)}\n${status}`;
const completion = (content = 'Hello.', model = 'qwen3-1.7b') => ({
  id: 'chatcmpl-smoke', object: 'chat.completion', created: 1, model,
  choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 12, completion_tokens: 3, total_tokens: 15 },
});

function dockerFixture({ health = [reply({ status: 'ok' })], models, completions, startupError, cleanupError } = {}) {
  const calls = [];
  let healthIndex = 0;
  let completionIndex = 0;
  const run = async (file, args, options) => {
    calls.push({ file, args, options });
    assert.equal(file, 'docker');
    if (args[0] !== 'compose') {
      if (args[1] === 'ls') {
        const project = args.find((arg) => arg.startsWith('label=com.docker.compose.project=')).split('=')[2];
        return { stdout: `${project}_${args[0] === 'volume' ? 'fantasy-ai-models' : 'default'}\n` };
      }
      return { stdout: '' };
    }
    const command = args[5];
    if (command === 'up' && startupError) throw startupError;
    if (command === 'rm' && cleanupError) throw cleanupError;
    if (command !== 'exec') return { stdout: '' };
    const endpoint = args.at(-1);
    if (endpoint.endsWith('/health')) return { stdout: health[Math.min(healthIndex++, health.length - 1)] };
    if (endpoint.endsWith('/v1/models')) return { stdout: models ?? reply({ object: 'list', data: [{ id: 'qwen3-1.7b', object: 'model', created: 1, owned_by: 'llamacpp' }] }) };
    return { stdout: completions?.[completionIndex++] ?? reply(completion()) };
  };
  return { calls, run };
}

const quiet = () => {};
const composeCommands = (calls, command) => calls.filter(({ args }) => args[0] === 'compose' && args[5] === command);

test('smoke starts only isolated AI services and sends three bounded synthetic requests through stdin', async () => {
  const fixture = dockerFixture();
  const result = await runSmoke({ run: fixture.run, log: quiet });
  const start = composeCommands(fixture.calls, 'up')[0];
  assert.match(result.projectName, /^tonarium-fantasy-ai-smoke-[a-f0-9]{32}$/);
  assert.deepEqual(start.args.slice(5), ['up', '--detach', '--build', 'fantasy-ai-model', 'fantasy-ai']);
  assert.deepEqual(result.languages, ['ko', 'en', 'ja']);
  assert.equal(result.model, 'qwen3-1.7b');
  for (const call of fixture.calls) {
    assert.ok(call.options.timeoutMs > 0);
    assert.ok(!call.args.includes('tonarium'));
    assert.ok(!call.args.includes('down'));
    if (call.args[0] === 'compose') assert.equal(call.args[4], result.projectName);
  }
  const requests = composeCommands(fixture.calls, 'exec').filter(({ args }) => args.at(-1).endsWith('/v1/chat/completions'));
  assert.equal(requests.length, 3);
  assert.equal(new Set(requests.map(({ options }) => JSON.parse(options.input).messages.at(-1).content)).size, 3);
  for (const { args, options } of requests) {
    assert.ok(args.includes('@-'));
    assert.ok(args.includes('-T'));
    const body = JSON.parse(options.input);
    assert.equal(body.model, 'qwen3-1.7b');
    assert.equal(body.max_tokens, 32);
    assert.equal(body.stream, false);
    assert.equal(body.chat_template_kwargs.enable_thinking, false);
    assert.equal(body.messages[0].role, 'system');
    assert.ok(!args.includes(body.messages.at(-1).content));
  }
  assert.equal(composeCommands(fixture.calls, 'rm').length, 1);
  const volumeRemoval = fixture.calls.find(({ args }) => args[0] === 'volume' && args[1] === 'rm');
  assert.deepEqual(volumeRemoval.args, ['volume', 'rm', `${result.projectName}_fantasy-ai-models`]);
  assert.ok(!volumeRemoval.args.includes('--force'));
  const volumeQuery = fixture.calls.find(({ args }) => args[0] === 'volume' && args[1] === 'ls');
  assert.ok(volumeQuery.args.includes('label=com.docker.compose.volume=fantasy-ai-models'));
});

test('readiness retries a loading response but fails within the shared startup deadline', async () => {
  let time = 0;
  const loading = dockerFixture({ health: [reply({ error: { message: 'Loading model' } }, 503)] });
  await assert.rejects(runSmoke({
    run: loading.run, log: quiet, startupTimeoutMs: 100,
    now: () => time, sleep: async (ms) => { time += ms; },
  }), /healthy.*100 ms/i);
  assert.equal(time, 100);
  assert.equal(composeCommands(loading.calls, 'rm').length, 1);
  assert.equal(composeCommands(loading.calls, 'exec').filter(({ args }) => args.at(-1).endsWith('/v1/chat/completions')).length, 0);

  time = 0;
  const ready = dockerFixture({ health: [reply({ status: 'loading' }, 503), reply({ status: 'ok' })] });
  await runSmoke({ run: ready.run, log: quiet, now: () => time, sleep: async (ms) => { time += ms; } });
  assert.equal(composeCommands(ready.calls, 'exec').filter(({ args }) => args.at(-1).endsWith('/health')).length, 2);
});

test('wrong model alias fails before generation and still removes only the smoke model volume', async () => {
  const fixture = dockerFixture({ models: reply({ object: 'list', data: [{ id: 'unexpected-model', object: 'model', created: 1, owned_by: 'llamacpp' }] }) });
  await assert.rejects(runSmoke({ run: fixture.run, log: quiet }), /qwen3-1\.7b/);
  assert.equal(composeCommands(fixture.calls, 'exec').filter(({ args }) => args.at(-1).endsWith('/v1/chat/completions')).length, 0);
  assert.equal(composeCommands(fixture.calls, 'rm').length, 1);
  assert.equal(fixture.calls.filter(({ args }) => args[0] === 'volume' && args[1] === 'rm').length, 1);
});

test('generation rejects HTTP failures, malformed JSON, a wrong model, and reasoning without spoken content', async () => {
  for (const response of [
    reply({ error: { message: 'Failed to generate' } }, 500),
    'not json\n200',
    reply(completion('Hello.', 'other-model')),
    reply(completion(' \n ')),
    reply(completion('<think>Only hidden reasoning.</think>')),
    reply(completion('<think>Unfinished hidden reasoning.')),
    reply({ ...completion(), choices: [{ index: 0, message: { role: 'assistant', content: null, reasoning_content: 'Hidden reasoning' }, finish_reason: 'length' }] }),
  ]) {
    const fixture = dockerFixture({ completions: [response] });
    await assert.rejects(runSmoke({ run: fixture.run, log: quiet }));
    assert.equal(composeCommands(fixture.calls, 'rm').length, 1);
  }
});

test('failure during provisioning is reported after diagnostics and cleanup', async () => {
  const fixture = dockerFixture({ startupError: new Error('model checksum mismatch') });
  await assert.rejects(runSmoke({ run: fixture.run, log: quiet }), /model checksum mismatch/);
  assert.equal(composeCommands(fixture.calls, 'logs').length, 1);
  assert.equal(composeCommands(fixture.calls, 'rm').length, 1);
});

test('cleanup failure cannot report a successful smoke', async () => {
  const fixture = dockerFixture({ cleanupError: new Error('container could not stop') });
  await assert.rejects(runSmoke({ run: fixture.run, log: quiet }), /container could not stop/);
});

test('cancellation during provisioning still performs cleanup with an uncancelled command', async () => {
  const controller = new AbortController();
  const fixture = dockerFixture();
  const run = async (file, args, options) => {
    if (args[0] === 'compose' && args[5] === 'up') {
      controller.abort(new Error('smoke cancelled'));
      options.signal.throwIfAborted();
    }
    return fixture.run(file, args, options);
  };
  await assert.rejects(runSmoke({ run, log: quiet, signal: controller.signal }), /smoke cancelled/);
  const removal = composeCommands(fixture.calls, 'rm')[0];
  assert.ok(removal);
  assert.equal(removal.options.signal, undefined);
});

test('records the unique project before provisioning so a separate cleanup can recover after an interrupted step', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tonarium-ai-smoke-test-'));
  const stateFile = join(directory, 'project');
  try {
    const fixture = dockerFixture({ cleanupError: new Error('interrupted cleanup') });
    const run = async (file, args, options) => {
      if (args[0] === 'compose' && args[5] === 'up') assert.equal((await readFile(stateFile, 'utf8')).trim(), args[4]);
      return fixture.run(file, args, options);
    };
    await assert.rejects(runSmoke({ run, log: quiet, stateFile }), /interrupted cleanup/);
    const projectName = (await readFile(stateFile, 'utf8')).trim();
    assert.match(projectName, /^tonarium-fantasy-ai-smoke-[a-f0-9]{32}$/);
    const recovery = dockerFixture();
    assert.equal(await smoke.cleanupSmokeProject({ run: recovery.run, log: quiet, stateFile }), true);
    assert.equal(composeCommands(recovery.calls, 'rm')[0].args[4], projectName);
    await assert.rejects(readFile(stateFile), { code: 'ENOENT' });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('separate cleanup tolerates absent state and refuses a project outside its generated namespace', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tonarium-ai-smoke-test-'));
  const stateFile = join(directory, 'project');
  const fixture = dockerFixture();
  try {
    assert.equal(await smoke.cleanupSmokeProject({ run: fixture.run, log: quiet, stateFile }), false);
    await writeFile(stateFile, 'tonarium\n');
    await assert.rejects(smoke.cleanupSmokeProject({ run: fixture.run, log: quiet, stateFile }), /refusing/i);
    assert.equal(fixture.calls.length, 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('cleanup refuses a volume not named for the unique smoke project', async () => {
  const fixture = dockerFixture();
  const run = async (file, args, options) => args[0] === 'volume' && args[1] === 'ls'
    ? { stdout: 'tonarium-data\n' }
    : fixture.run(file, args, options);
  await assert.rejects(runSmoke({ run, log: quiet }), /refusing.*volume/i);
  assert.equal(fixture.calls.filter(({ args }) => args[0] === 'volume' && args[1] === 'rm').length, 0);
});

test('command runner passes JSON unchanged to a real child stdin without interpreting shell text', async () => {
  const input = JSON.stringify({ content: 'quote " and $() `literal` ; & 한글 日本語' });
  const result = await runCommand(process.execPath, ['-e', 'process.stdin.pipe(process.stdout)'], { input, timeoutMs: 3000 });
  assert.equal(result.stdout, input);
});

test('command runner terminates a stalled child and preserves nonzero exit diagnostics', async () => {
  await assert.rejects(runCommand(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { timeoutMs: 100 }), /timed out/i);
  await assert.rejects(runCommand(process.execPath, ['-e', 'console.error("fixture failure"); process.exit(7)'], { timeoutMs: 3000 }), /fixture failure/);
});

test('command runner promptly terminates an aborted child', async () => {
  const controller = new AbortController();
  const started = Date.now();
  const result = runCommand(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { timeoutMs: 3000, signal: controller.signal });
  setTimeout(() => controller.abort(), 20);
  await assert.rejects(result, /abort/i);
  assert.ok(Date.now() - started < 1500);
});
