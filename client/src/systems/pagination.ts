export const CATALOG_PAGE_SIZE = 10;

export function catalogPage<T>(items: readonly T[], requestedPage: number) {
  const pageCount = Math.max(1, Math.ceil(items.length / CATALOG_PAGE_SIZE));
  const candidate = Number.isFinite(requestedPage) ? Math.trunc(requestedPage) : 1;
  const page = Math.max(1, Math.min(candidate, pageCount));
  const start = (page - 1) * CATALOG_PAGE_SIZE;
  return { page, pageCount, total: items.length, entries: items.slice(start, start + CATALOG_PAGE_SIZE) };
}

export function uniqueSystemIds(entries: readonly { id: string }[]) {
  return [...new Set(entries.map(entry => entry.id))].sort();
}
