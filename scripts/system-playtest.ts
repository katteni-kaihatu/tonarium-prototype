import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { SystemService } from '../server/system-service.ts';
import { systemDemoMap } from '../shared/system-demo.ts';
import { reconcileSystemItems } from '../server/system-items.ts';
import { atomicJSON } from '../server/shared-catalog.ts';
import type { Item } from '../shared/items.ts';
import type { SystemCommand } from '../shared/system-types.ts';
import { ContentTranslationStore } from '../server/content-translations.ts';
import { collectContentDocuments, readContentMetadata } from '../server/content-translation-sources.ts';
import { createTranslator, mockTranslationModel } from '../server/translation.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SID = 'system-playtest';
const MAX_BODY = 256 * 1024;
const SLOTS = ['alice', 'bob'] as const;
class RequestError extends Error { constructor(message: string, readonly status: number) { super(message); } }

interface PlaytestOptions { directory: string; source?: string; webPort?: number; tickMs?: number }
export function createSystemPlaytestServer(options: PlaytestOptions) {
  if (process.env.NODE_ENV === 'production') throw new Error('System playtest is local development only');
  const service = new SystemService(options.directory, options.source ?? ROOT);
  if (service.startupErrors.length) throw new Error(service.startupErrors.join('; '));
  const metadata = (() => {
    try { return readContentMetadata(options.source ?? ROOT); }
    catch { console.error('Local content translation metadata is invalid; original text remains available.'); return { schema: 1 as const, glossary: {}, entries: {} }; }
  })();
  const contentTranslations = new ContentTranslationStore(path.join(options.directory, 'content-translations'), createTranslator(mockTranslationModel), { glossary: metadata.glossary, profile: 'system-playtest:mock:1' });
  let translationReady = Promise.resolve();
  try {
    translationReady = contentTranslations.register(collectContentDocuments(service.catalog.current(), metadata)).catch(() => {
      console.error('Local content translation registration failed; original text remains available.');
    });
  } catch { console.error('Local content translation registration failed; original text remains available.'); }
  service.load(SID, 'alice', systemDemoMap, ['alice']);
  const itemFile = path.join(options.directory, 'system-playtest-items.json');
  let mapItems = new Map<string, Item>((fs.existsSync(itemFile) ? JSON.parse(fs.readFileSync(itemFile, 'utf8')) as Item[] : []).map(item => [item.id, item]));
  const syncItems = (createMissingNative = false) => {
    const changes = reconcileSystemItems(mapItems, service.view(SID), { createMissingNative });
    if (changes.changed.length || changes.removed.length) { atomicJSON(itemFile, [...changes.items.values()]); mapItems = changes.items; }
  };
  syncItems(true);
  const sessions = new Map<string, { actor: string; at: number }>();
  const participants = () => [...new Set([...sessions.values()].map(session => session.actor))];
  const json = (res: http.ServerResponse, status: number, value: unknown) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(JSON.stringify(value));
  };
  const payload = (actor: string) => { syncItems(); return { sid: SID, actor, participants: participants(), view: service.view(SID), items: [...mapItems.values()] }; };
  async function body(req: http.IncomingMessage) {
    if (!req.headers['content-type']?.startsWith('application/json')) throw new RequestError('JSON body required', 415);
    if (Number(req.headers['content-length'] ?? 0) > MAX_BODY) throw new RequestError('Request too large', 413);
    const chunks: Buffer[] = []; let bytes = 0;
    for await (const chunk of req) { bytes += chunk.length; if (bytes > MAX_BODY) throw new RequestError('Request too large', 413); chunks.push(chunk); }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>; }
    catch { throw new RequestError('Invalid JSON body', 400); }
  }
  const server = http.createServer((req, res) => {
    void (async () => {
      const host = new URL(`http://${req.headers.host ?? 'invalid'}`);
      if (!['127.0.0.1', 'localhost', '[::1]'].includes(host.hostname)) throw new RequestError('Loopback host required', 403);
      if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '')) throw new RequestError('Loopback connection required', 403);
      const pathname = new URL(req.url ?? '/', 'http://local').pathname;
      if (pathname === '/api/content-translations') {
        if (req.method !== 'GET' && req.method !== 'HEAD') { res.setHeader('Allow', 'GET, HEAD'); json(res, 405, { error: 'GET or HEAD required' }); return; }
        json(res, 200, req.method === 'HEAD' ? undefined : contentTranslations.catalog()); return;
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        let origin: URL;
        try { origin = new URL(req.headers.origin ?? ''); } catch { throw new RequestError('Local origin required', 403); }
        const port = (server.address() as { port: number } | null)?.port;
        if (origin.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname) || ![String(port), String(options.webPort ?? 5175)].includes(origin.port)) throw new RequestError('Local origin required', 403);
      }
      if (pathname === '/api/system-playtest/health' && req.method === 'GET') { json(res, 200, { ready: true, systems: service.catalog.current().entries.length }); return; }
      if (service.http(req, res, pathname)) return;
      if (!pathname.startsWith('/api/system-playtest')) { json(res, 404, { error: 'Not found' }); return; }
      if (pathname === '/api/system-playtest/join' && req.method === 'POST') {
        const input = await body(req); const actor = input.slot;
        if (typeof actor !== 'string' || !SLOTS.includes(actor as typeof SLOTS[number])) throw new RequestError('Choose alice or bob', 400);
        if (sessions.size >= 32) throw new RequestError('Too many local test tabs', 429);
        const token = randomBytes(24).toString('hex'); sessions.set(token, { actor, at: Date.now() });
        json(res, 200, { ...payload(actor), token }); return;
      }
      const token = req.headers['x-system-playtest-token'];
      const session = typeof token === 'string' ? sessions.get(token) : undefined;
      if (!session) throw new RequestError('Join the local playtest first', 401);
      session.at = Date.now();
      if (pathname === '/api/system-playtest/leave' && req.method === 'POST') {
        sessions.delete(token as string);
        if (!participants().includes(session.actor)) service.leave(SID, session.actor);
        json(res, 200, { left: true }); return;
      }
      if (pathname !== '/api/system-playtest') { json(res, 404, { error: 'Not found' }); return; }
      if (req.method === 'GET') { json(res, 200, payload(session.actor)); return; }
      if (req.method !== 'POST') { json(res, 405, { error: 'GET or POST required' }); return; }
      const input = await body(req);
      if (!input.command || typeof input.command !== 'object' || Array.isArray(input.command)) throw new RequestError('System command required', 400);
      const command = input.command as Exclude<SystemCommand, { kind: 'map' }>;
      if (!['input', 'interact'].includes(command.kind)) throw new RequestError('Only system inputs are accepted', 400);
      try { service.apply(SID, session.actor, command, participants()); }
      catch (error) {
        const message = error instanceof Error ? error.message : 'System input failed';
        json(res, message.includes('revision conflict') ? 409 : message.includes('rate exceeded') ? 429 : 422, { ...payload(session.actor), error: message }); return;
      }
      json(res, 200, payload(session.actor));
    })().catch(error => {
      if (!res.headersSent) json(res, error instanceof RequestError ? error.status : 500, { error: error instanceof Error ? error.message : 'Local playtest request failed' });
      else res.end();
    });
  });
  server.requestTimeout = 10_000;
  const tick = () => {
    for (const [token, session] of sessions) if (Date.now() - session.at > 15_000) {
      sessions.delete(token); if (!participants().includes(session.actor)) service.leave(SID, session.actor);
    }
    const changed = service.tick(SID, participants()); syncItems(); return changed;
  };
  const interval = options.tickMs === 0 ? undefined : setInterval(() => { try { tick(); } catch (error) { console.error('Local system tick failed', error); } }, options.tickMs ?? 100);
  interval?.unref();
  return {
    server, service, tick,
    async close() {
      if (interval) clearInterval(interval);
      await translationReady;
      for (const actor of participants()) service.leave(SID, actor);
      service.dispose(); sessions.clear();
      await new Promise<void>((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeAllConnections(); });
    },
  };
}

export async function runSystemPlaytest() {
  if (process.env.NODE_ENV === 'production') throw new Error('System playtest is local development only');
  if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('Node 24 or newer is required for the local system playtest');
  const apiPort = Number(process.env.SYSTEM_PLAYTEST_API_PORT ?? 3002), webPort = Number(process.env.SYSTEM_PLAYTEST_WEB_PORT ?? 5175);
  if (![apiPort, webPort].every(port => Number.isInteger(port) && port >= 1024 && port <= 65535) || apiPort === webPort) throw new Error('Invalid local playtest ports');
  const app = createSystemPlaytestServer({ directory: path.join(ROOT, '.local', 'system-playtest'), webPort });
  await new Promise<void>((resolve, reject) => { app.server.once('error', reject); app.server.listen(apiPort, '127.0.0.1', resolve); });
  let vite: ChildProcess | undefined;
  let stopping = false;
  const stop = async () => { if (stopping) return; stopping = true; vite?.kill(); await app.close(); };
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { void stop().finally(() => process.exit(0)); });
  const inherited = new Set(['PATH', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'PATHEXT', 'TEMP', 'TMP', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'HOMEDRIVE', 'HOMEPATH']);
  const environment = Object.fromEntries(Object.entries(process.env).filter(([name]) => inherited.has(name.toUpperCase())));
  vite = spawn(process.execPath, [path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', '127.0.0.1', '--port', String(webPort), '--strictPort'], {
    cwd: ROOT, windowsHide: true, stdio: 'inherit',
    env: { ...environment, NODE_ENV: 'development', VITE_SYSTEM_PLAYTEST: '1', SERVER_PORT: String(apiPort), CLIENT_PORT: String(webPort), SYSTEM_PLAYTEST_API_PORT: String(apiPort), SYSTEM_PLAYTEST_WEB_PORT: String(webPort) },
  });
  vite.once('error', error => { console.error(error.message); void stop().finally(() => process.exit(1)); });
  vite.once('exit', code => { if (!stopping) void stop().finally(() => process.exit(code ?? 1)); });
  console.log(`Local shared-system playtest: http://127.0.0.1:${webPort}/?systemPlaytest=1`);
  console.log(`Second participant: http://127.0.0.1:${webPort}/?systemPlaytest=1&actor=bob`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void runSystemPlaytest().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
}
