import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { atomicJSON } from './shared-catalog.ts';
import { SystemCatalogStore, activateBundledSystems, validateSystemSubmission } from './system-catalog.ts';
import { SystemRuntime } from './system-runtime.ts';
import type { SystemCommand, SystemMap, SystemRuntimeState } from '../shared/system-types.ts';

export class SystemService {
  readonly catalog: SystemCatalogStore;
  private rooms = new Map<string, SystemRuntime>();
  private rates = new Map<string, { at: number; count: number }>();
  readonly startupErrors: string[] = [];

  constructor(private directory: string, source?: string) {
    this.catalog = new SystemCatalogStore(path.join(directory, 'shared-systems'));
    if (source) {
      try {
        const activated = activateBundledSystems(this.catalog, path.join(source, 'system-bundle'));
        if (!activated && fs.existsSync(path.join(source, 'shared-systems'))) this.catalog.publish(validateSystemSubmission(source));
      } catch (error) { this.startupErrors.push(`System registration: ${error instanceof Error ? error.message : String(error)}`); }
    }
  }

  private runtime(sid: string) {
    let runtime = this.rooms.get(sid);
    if (!runtime) {
      const file = path.join(this.directory, 'system-state', createHash('sha256').update(sid).digest('hex') + '.json');
      const state: SystemRuntimeState | undefined = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : undefined;
      runtime = new SystemRuntime(() => this.catalog.current(), next => atomicJSON(file, next), state);
      this.rooms.set(sid, runtime);
    }
    return runtime;
  }

  view(sid: string) { return this.runtime(sid).view(); }
  load(sid: string, actor: string, map: SystemMap, participants: string[]) {
    this.limit(sid, actor);
    const runtime = this.runtime(sid);
    return runtime.apply(actor, { kind: 'map', id: `load-${randomUUID()}`, revision: runtime.view().revision, map }, participants);
  }
  apply(sid: string, actor: string, command: Exclude<SystemCommand, { kind: 'map' }>, participants: string[]) {
    this.limit(sid, actor);
    if (command.kind === ('map' as string)) throw new Error('Load maps from registered map code');
    return this.runtime(sid).apply(actor, command, participants);
  }
  private limit(sid: string, actor: string) {
    const key = JSON.stringify([sid, actor]), now = Date.now(), rate = this.rates.get(key);
    if (!rate || now - rate.at >= 1000) this.rates.set(key, { at: now, count: 1 });
    else if (++rate.count > 20) throw new Error('System input rate exceeded');
  }
  tick(sid: string, participants: string[]) {
    const runtime = this.rooms.get(sid);
    return runtime ? runtime.refresh() || runtime.tick(participants) : false;
  }
  leave(sid: string, actor: string) {
    this.rates.delete(JSON.stringify([sid, actor]));
    return this.rooms.get(sid)?.leave(actor) ?? false;
  }
  release(sid: string) {
    this.rooms.get(sid)?.dispose(); this.rooms.delete(sid);
    for (const key of this.rates.keys()) if ((JSON.parse(key) as [string, string])[0] === sid) this.rates.delete(key);
  }
  dispose() { for (const runtime of this.rooms.values()) runtime.dispose(); this.rooms.clear(); this.rates.clear(); }

  http(req: IncomingMessage, res: ServerResponse, pathname: string) {
    if (pathname !== '/api/shared-systems' && !pathname.startsWith('/system-originals/')) return false;
    if (!['GET', 'HEAD'].includes(req.method ?? '')) { res.writeHead(405).end(); return true; }
    try {
      const object = pathname.startsWith('/system-originals/');
      const bytes = object ? this.catalog.read(pathname.slice('/system-originals/'.length)) : Buffer.from(JSON.stringify(this.catalog.current()));
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
      res.setHeader('Cache-Control', object ? 'public, max-age=31536000, immutable' : 'no-store');
      res.setHeader('Content-Length', bytes.length);
      res.end(req.method === 'HEAD' ? undefined : bytes);
    } catch { res.writeHead(404).end(); }
    return true;
  }
}
