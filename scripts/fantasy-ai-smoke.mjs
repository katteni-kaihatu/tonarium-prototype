import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const model = 'qwen3-1.7b';
const services = ['fantasy-ai-model', 'fantasy-ai'];
const prompts = [
  { language: 'ko', content: '한국어로 짧은 인사 한 문장을 말해 주세요.' },
  { language: 'en', content: 'Say one short greeting in English.' },
  { language: 'ja', content: '日本語で短い挨拶を一文で答えてください。' },
];

export function runCommand(file, args, { input, timeoutMs, signal, cwd = root } = {}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('A positive command timeout is required.');
  return new Promise((resolveCommand, reject) => {
    const child = spawn(file, args, { cwd, signal, killSignal: 'SIGKILL', shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let failure;
    const timer = setTimeout(() => {
      failure = new Error(`${file} ${args[0] ?? ''} timed out after ${timeoutMs} ms.`);
      child.kill('SIGKILL');
    }, timeoutMs);
    timer.unref();
    const capture = (target) => (chunk) => {
      if (target === 'stdout') stdout += chunk.toString();
      else stderr += chunk.toString();
      if (Buffer.byteLength(stdout) + Buffer.byteLength(stderr) > 1024 * 1024) {
        failure = new Error(`${file} output exceeded 1 MiB.`);
        child.kill('SIGKILL');
      }
    };
    child.stdout.on('data', capture('stdout'));
    child.stderr.on('data', capture('stderr'));
    child.on('error', (error) => { failure = error; });
    child.stdin.on('error', (error) => {
      if (error.code !== 'EPIPE') failure = error;
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (failure) return reject(failure);
      if (code !== 0) return reject(new Error(`${file} ${args[0] ?? ''} failed (${code ?? signal}): ${(stderr || stdout).slice(-8000)}`));
      resolveCommand({ stdout, stderr });
    });
    child.stdin.end(input);
  });
}

function jsonResponse(stdout, endpoint) {
  const separator = stdout.lastIndexOf('\n');
  const status = stdout.slice(separator + 1).trim();
  if (separator < 0 || status !== '200') throw new Error(`${endpoint} returned HTTP ${status || 'unknown'}.`);
  try {
    return JSON.parse(stdout.slice(0, separator));
  } catch {
    throw new Error(`${endpoint} did not return valid JSON.`);
  }
}

async function cleanup(run, compose, projectName) {
  const failures = [];
  try {
    await run('docker', [...compose, 'rm', '--stop', '--force', '--volumes', ...services], { timeoutMs: 60_000 });
  } catch (error) {
    failures.push(error);
  }
  for (const [type, suffix] of [['volume', 'fantasy-ai-models'], ['network', 'default']]) {
    try {
      const expected = `${projectName}_${suffix}`;
      const { stdout } = await run('docker', [type, 'ls', '--filter', `label=com.docker.compose.project=${projectName}`, '--filter', `label=com.docker.compose.${type}=${suffix}`, '--format', '{{.Name}}'], { timeoutMs: 10_000 });
      const names = stdout.split(/\r?\n/).map((name) => name.trim()).filter(Boolean);
      if (names.some((name) => name !== expected)) throw new Error(`Refusing to remove an unexpected ${type} from smoke project ${projectName}.`);
      if (names.length) await run('docker', [type, 'rm', expected], { timeoutMs: 20_000 });
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length) throw new AggregateError(failures, `Smoke cleanup failed: ${failures.map((error) => error.message).join('; ')}`);
}

export async function cleanupSmokeProject({
  run = runCommand, log = console.log, stateFile, composeFile = resolve(root, 'docker-compose.yml'),
} = {}) {
  if (!stateFile) throw new Error('A smoke project state file is required for separate cleanup.');
  let projectName;
  try {
    projectName = (await readFile(stateFile, 'utf8')).trim();
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    log('No recorded AI smoke project needs cleanup.');
    return false;
  }
  if (!/^tonarium-fantasy-ai-smoke-[a-f0-9]{32}$/.test(projectName)) throw new Error('Refusing to clean a project outside the generated AI smoke namespace.');
  log(`Recovering cleanup for AI smoke project ${projectName}.`);
  await cleanup(run, ['compose', '--file', composeFile, '--project-name', projectName], projectName);
  await rm(stateFile, { force: true });
  return true;
}

export async function runSmoke({
  run = runCommand, log = console.log, now = Date.now, sleep: pause = sleep,
  composeFile = resolve(root, 'docker-compose.yml'), startupTimeoutMs = 12 * 60_000, signal, stateFile,
} = {}) {
  if (!Number.isFinite(startupTimeoutMs) || startupTimeoutMs <= 0) throw new Error('A positive startup timeout is required.');
  const projectName = `tonarium-fantasy-ai-smoke-${randomUUID().replaceAll('-', '')}`;
  const compose = ['compose', '--file', composeFile, '--project-name', projectName];
  if (stateFile) await writeFile(stateFile, `${projectName}\n`, { flag: 'wx', mode: 0o600 });
  const deadline = now() + startupTimeoutMs;
  const curl = async (endpoint, { input, timeoutMs = 90_000 } = {}) => {
    const args = [...compose, 'exec', '-T', 'fantasy-ai', 'curl', '--silent', '--show-error', '--connect-timeout', '5', '--max-time', String(Math.max(1, Math.floor(timeoutMs / 1000) - 1)), '--write-out', '\n%{http_code}'];
    if (input !== undefined) args.push('--request', 'POST', '--header', 'Content-Type: application/json', '--data-binary', '@-');
    args.push(`http://127.0.0.1:8080${endpoint}`);
    const { stdout } = await run('docker', args, { input, timeoutMs, signal });
    return jsonResponse(stdout, endpoint);
  };
  let failure;
  try {
    signal?.throwIfAborted();
    log(`Starting isolated AI smoke project ${projectName}; provisioning and readiness deadline: ${startupTimeoutMs / 1000}s.`);
    await run('docker', [...compose, 'up', '--detach', '--build', ...services], { timeoutMs: Math.max(1, deadline - now()), signal });
    let readinessError;
    while (now() < deadline) {
      try {
        const health = await curl('/health', { timeoutMs: Math.max(1, Math.min(20_000, deadline - now())) });
        if (health.status !== 'ok') throw new Error('/health did not report status ok.');
        readinessError = undefined;
        break;
      } catch (error) {
        signal?.throwIfAborted();
        readinessError = error;
      }
      await pause(Math.max(0, Math.min(5000, deadline - now())), undefined, { signal });
    }
    if (readinessError || now() >= deadline) throw new Error(`Fantasy AI did not become healthy within ${startupTimeoutMs} ms: ${readinessError?.message ?? 'startup deadline exceeded'}`);
    log('Runtime health passed. Checking the pinned model alias.');
    const models = await curl('/v1/models');
    if (!Array.isArray(models.data) || !models.data.some((entry) => entry.id === model)) throw new Error(`/v1/models is missing the expected alias ${model}.`);
    for (const { language, content } of prompts) {
      const response = await curl('/v1/chat/completions', {
        input: JSON.stringify({
          model, stream: false, max_tokens: 32, temperature: 0,
          chat_template_kwargs: { enable_thinking: false },
          messages: [{ role: 'system', content: 'Answer the user in one short sentence. Do not include reasoning.' }, { role: 'user', content }],
        }),
      });
      if (response.model !== model) throw new Error(`${language} completion returned an unexpected model; expected ${model}.`);
      const message = response.choices?.[0]?.message;
      const spoken = typeof message?.content === 'string'
        ? message.content.replace(/<think\b[^>]*>[\s\S]*?(?:<\/think>|$)/gi, '').replace(/<\/?think\b[^>]*>/gi, '').trim()
        : '';
      if (message?.role !== 'assistant' || !/[\p{L}\p{N}]/u.test(spoken)) throw new Error(`${language} completion did not contain nonempty spoken content.`);
      log(`${language}: HTTP 200, expected model alias, and nonempty spoken content passed.`);
    }
  } catch (error) {
    failure = error;
    if (!signal?.aborted) {
      try {
        const { stdout, stderr } = await run('docker', [...compose, 'logs', '--no-color', '--tail', '100', ...services], { timeoutMs: 20_000 });
        if (stdout) log(stdout);
        if (stderr) log(stderr);
      } catch (diagnosticError) {
        log(`Could not collect AI service logs: ${diagnosticError.message}`);
      }
    }
  } finally {
    log(`Cleaning up AI containers, model volume, and network belonging to ${projectName}.`);
    try {
      await cleanup(run, compose, projectName);
      if (stateFile) await rm(stateFile, { force: true });
    } catch (cleanupError) {
      failure = failure ? new AggregateError([failure, cleanupError], `${failure.message}; ${cleanupError.message}`) : cleanupError;
    }
  }
  if (failure) throw failure;
  log('Fantasy AI smoke passed for ko/en/ja synthetic requests. Language quality was not assessed.');
  return { projectName, model, languages: prompts.map(({ language }) => language) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const stateFile = process.env.FANTASY_AI_SMOKE_STATE_FILE;
  const controller = new AbortController();
  const cancel = () => controller.abort(new Error('Fantasy AI smoke cancelled.'));
  process.once('SIGINT', cancel);
  process.once('SIGTERM', cancel);
  const task = args.length === 0
    ? () => runSmoke({ signal: controller.signal, stateFile })
    : args.length === 1 && args[0] === '--cleanup'
      ? () => cleanupSmokeProject({ stateFile })
      : async () => { throw new Error('Usage: node scripts/fantasy-ai-smoke.mjs [--cleanup]'); };
  task()
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    })
    .finally(() => {
      process.removeListener('SIGINT', cancel);
      process.removeListener('SIGTERM', cancel);
    });
}
