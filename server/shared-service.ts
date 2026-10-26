import fs from 'node:fs';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createHash } from 'node:crypto';
import { CatalogStore, atomicJSON } from './shared-catalog.ts';
import { SharedRuntime, type RuntimeState } from './shared-runtime.ts';
import type { AssetCommand, AssetView } from '../shared/shared-assets.ts';

export class SharedService {
  readonly catalog: CatalogStore;
  private rooms = new Map<string, SharedRuntime>();
  private rate = new Map<string, { at: number; count: number }>();
  constructor(private directory: string) { this.catalog = new CatalogStore(path.join(directory, 'shared-originals')); }
  private runtime(sid: string) {
    let runtime = this.rooms.get(sid);
    if (!runtime) {
      const file = path.join(this.directory, 'shared-state', createHash('sha256').update(sid).digest('hex') + '.json');
      const state: RuntimeState | undefined = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : undefined;
      runtime = new SharedRuntime(() => this.catalog.current(), state => atomicJSON(file, state), state);
      this.rooms.set(sid, runtime);
    }
    return runtime;
  }
  view(sid: string, user: string): AssetView { return this.runtime(sid).view(user); }
  apply(sid: string, user: string, command: AssetCommand) {
    const key = JSON.stringify([sid, user]); const now = Date.now(); const rate = this.rate.get(key);
    if (!rate || now - rate.at >= 1000) this.rate.set(key, { at: now, count: 1 });
    else if (++rate.count > 20) throw new Error('command rate exceeded');
    return this.runtime(sid).apply(user, command);
  }
  release(sid: string) { this.rooms.delete(sid); for (const key of this.rate.keys()) if (JSON.parse(key)[0] === sid) this.rate.delete(key); }
  http(req: IncomingMessage, res: ServerResponse, pathname: string): boolean {
    if (pathname !== '/api/shared-catalog' && !pathname.startsWith('/shared-originals/')) return false;
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return true; }
    try {
      const object = pathname.startsWith('/shared-originals/');
      const bytes = object ? this.catalog.read(pathname.slice('/shared-originals/'.length)) : Buffer.from(JSON.stringify(this.catalog.current()));
      res.setHeader('Content-Type', object ? 'application/octet-stream' : 'application/json; charset=utf-8');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
      res.setHeader('Cache-Control', object ? 'public, max-age=31536000, immutable' : 'no-store');
      res.setHeader('Content-Length', bytes.length); res.end(req.method === 'HEAD' ? undefined : bytes);
    } catch { res.writeHead(404); res.end(); }
    return true;
  }
}
