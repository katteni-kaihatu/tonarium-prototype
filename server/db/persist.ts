/**
 * DB への書き込みを 1 本の列に並べる。サーバーはメモリ側が正で、変更のたびにここへ書き込みを積む。
 * 順番どおりに 1 つずつ流すので、同じ行への古い書き込みが新しいものを追い越さない。失敗はログに出して次へ進む
 */
let tail: Promise<void> = Promise.resolve();
let pending = 0;

export function enqueue(label: string, job: () => Promise<unknown>, onError?: () => void) {
  pending++;
  tail = tail.then(job).then(
    () => { pending--; },
    (e) => { pending--; console.error(`DB への書き込みに失敗しました (${label}):`, e); onError?.(); },
  );
}

/** 積んである書き込みが全部終わるまで待つ（終了時用） */
export async function drain() {
  while (pending > 0) await tail;
}

/**
 * 続けて呼ばれてもまとめて 1 回だけ積む。flush は保留分をその場で積む（終了時用）。
 * 失敗したら間を置いて書き直す（DB が一時的に落ちても、次に変わるまで DB が古いままにならないように）
 */
export function debounced(label: string, job: () => Promise<unknown>, ms = 800, retryMs = 5000) {
  let t: ReturnType<typeof setTimeout> | null = null;
  const run = () => { t = null; enqueue(label, job, () => { if (!t) t = setTimeout(run, retryMs); }); };
  const trigger = () => { if (!t) t = setTimeout(run, ms); };
  trigger.flush = () => { if (t) { clearTimeout(t); run(); } };
  return trigger;
}

/** PostgreSQL の文字列と jsonb は NUL を入れられず、1 つでも混ざると同じトランザクションの書き込みが全部失敗する。書く前に取り除く */
export function stripNul<T>(value: T): T {
  if (typeof value === 'string') return value.replaceAll('\u0000', '') as T;
  if (Array.isArray(value)) return value.map(stripNul) as T;
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [stripNul(k), stripNul(v)])) as T;
  return value;
}
