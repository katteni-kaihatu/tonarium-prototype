type Fetch = typeof globalThis.fetch;
type Task = { run: () => Promise<Response>; drained?: Promise<void>; signal?: AbortSignal | null; resolve: (response: Response) => void; reject: (error: unknown) => void; abort: () => void };

export function createLocalInferenceScheduler(fetcher: Fetch, options: { maxQueue?: number; concurrency?: number } = {}): Fetch {
  const queue: Task[] = [];
  let active = 0;
  const concurrency = Math.max(1, Math.min(2, Math.floor(options.concurrency ?? 1)));
  const pump = () => {
    if (active >= concurrency) return;
    const task = queue.shift();
    if (!task) return;
    task.signal?.removeEventListener('abort', task.abort);
    if (task.signal?.aborted) { task.reject(new DOMException('Aborted', 'AbortError')); pump(); return; }
    active++;
    void task.run().then(response => { task.resolve(response); return task.drained; }, task.reject).finally(() => { active--; pump(); });
  };
  return ((input: Parameters<Fetch>[0], init?: Parameters<Fetch>[1]) => {
    const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
    if (signal?.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
    if (queue.length >= (options.maxQueue ?? 4)) return Promise.resolve(new Response('', { status: 429 }));
    return new Promise<Response>((resolve, reject) => {
      const task: Task = {
        signal, resolve, reject,
        abort: () => { const index = queue.indexOf(task); if (index >= 0) { queue.splice(index, 1); reject(new DOMException('Aborted', 'AbortError')); } },
        run: async () => {
          const response = await fetcher(input, init);
          // 本文まで受け取り、モデルの生成枠を越える処理を待たせる。
          const reader = response.body?.getReader();
          if (!reader) return response;
          if (response.headers.get('content-type')?.includes('text/event-stream')) {
            let finish: () => void; let length = 0; let closed = false; let output: ReadableStreamDefaultController<Uint8Array>;
            task.drained = new Promise<void>(resolve => { finish = resolve; });
            const done = () => { try { reader.releaseLock(); } catch {} if (!closed) { closed = true; signal?.removeEventListener('abort', stop); finish!(); } };
            const stop = () => { try { output?.error(new DOMException('Aborted', 'AbortError')); } catch {} void reader.cancel().catch(() => {}).finally(done); done(); };
            const stream = new ReadableStream<Uint8Array>({
              start(controller) { output = controller; signal?.addEventListener('abort', stop, { once: true }); if (signal?.aborted) stop(); },
              async pull(controller) {
                try {
                  const chunk = await reader.read();
                  if (chunk.done) { controller.close(); done(); return; }
                  length += chunk.value.byteLength;
                  if (length > 262144) throw new Error('Local inference stream too large');
                  controller.enqueue(chunk.value);
                } catch (error) { try { controller.error(error); } catch {} await reader.cancel().catch(() => {}); done(); }
              },
              async cancel() { await reader.cancel().catch(() => {}); done(); },
            });
            return new Response(stream, { status: response.status, statusText: response.statusText, headers: response.headers });
          }
          const parts: Uint8Array[] = []; let length = 0;
          try {
            while (true) {
              const part = await reader.read();
              if (part.done) break;
              length += part.value.byteLength;
              if (length > 65_536) { await reader.cancel(); throw new Error('Local inference response too large'); }
              parts.push(part.value);
            }
          } finally { reader.releaseLock(); }
          const body = new Uint8Array(length); let offset = 0;
          for (const part of parts) { body.set(part, offset); offset += part.byteLength; }
          return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
        },
      };
      signal?.addEventListener('abort', task.abort, { once: true });
      queue.push(task); pump();
    });
  }) as Fetch;
}

export const localInferenceFetch = createLocalInferenceScheduler(globalThis.fetch, { concurrency: 2 });
