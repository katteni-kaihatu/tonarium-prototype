import { check, integrity, LIMITS } from '../../../shared/shared-assets.ts';

export class AssetLoader {
  private cache = new Map<string, Uint8Array>();
  private bytes = 0;
  private controller = new AbortController();
  private generation = 0;
  private active = 0;
  private waiting: (() => void)[] = [];
  constructor(private request: typeof fetch = fetch) {}
  cancel() { this.generation++; this.controller.abort(); this.controller = new AbortController(); }
  dispose() { this.cancel(); this.cache.clear(); this.bytes = 0; }
  private async acquire(signal: AbortSignal) {
    check(!signal.aborted, 'cancelled');
    if (this.active < 4) { this.active++; return; }
    await new Promise<void>((resolve, reject) => {
      const start = () => { signal.removeEventListener('abort', cancel); this.active++; resolve(); };
      const cancel = () => { this.waiting = this.waiting.filter(fn => fn !== start); reject(new Error('cancelled')); };
      signal.addEventListener('abort', cancel, { once: true }); this.waiting.push(start);
    });
  }
  async load(hash: string): Promise<Uint8Array> {
    check(integrity(hash), 'integrity'); const cached = this.cache.get(hash); if (cached) return cached.slice();
    const generation = this.generation, signal = this.controller.signal;
    await this.acquire(signal);
    try { check(generation === this.generation, 'cancelled'); return await this.fetchBytes(hash, generation, signal); }
    finally { this.active--; this.waiting.shift()?.(); }
  }
  private async fetchBytes(hash: string, generation: number, signal: AbortSignal): Promise<Uint8Array> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await this.request(`/shared-originals/${hash}`, { signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]), redirect: 'error', credentials: 'omit' });
        if (!response.ok) { await response.body?.cancel(); throw new Error('download failed'); }
        check(response.body, 'download body missing');
        const chunks: Uint8Array[] = []; let length = 0; const reader = response.body.getReader();
        try { for (;;) { const part = await reader.read(); if (part.done) break; length += part.value.length; check(length <= LIMITS.file, 'download size'); chunks.push(part.value); } } finally { await reader.cancel(); }
        const bytes = new Uint8Array(length); let offset = 0; for (const c of chunks) { bytes.set(c, offset); offset += c.length; }
        const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
        const actual = 'sha256-' + [...digest].map(b => b.toString(16).padStart(2, '0')).join('');
        check(actual === hash, 'integrity mismatch'); check(generation === this.generation && !signal.aborted, 'cancelled');
        const previous = this.cache.get(hash); if (previous) { this.bytes -= previous.length; this.cache.delete(hash); }
        while (this.bytes + bytes.length > LIMITS.bundle && this.cache.size) { const key = this.cache.keys().next().value!; this.bytes -= this.cache.get(key)!.length; this.cache.delete(key); }
        this.cache.set(hash, bytes); this.bytes += bytes.length; return bytes.slice();
      } catch (e) { if (signal.aborted || generation !== this.generation || attempt === 2) throw e; }
    }
    throw new Error('download failed');
  }
}
