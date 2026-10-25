import { create } from 'zustand';
import { CHANGELOG } from '../i18n/static.ts';
import type { ChangelogEntry } from '../../../shared/changelog.ts';

export function filterChangelog(entries: ChangelogEntry[], query: string, includeMaintenance = false) {
  const q = query.toLowerCase();
  return entries.filter((entry) =>
    (includeMaintenance || entry.tag !== '開発・保守') &&
    (!q || [entry.title, ...entry.items].some((text) => text.toLowerCase().includes(q))),
  );
}

const SEEN_KEY = 'tonarium.changelog.seen';

export function loadChangelogSeen(): string {
  try { return localStorage.getItem(SEEN_KEY) ?? ''; } catch { return ''; }
}

export const useChangelog = create(() => ({ seen: loadChangelogSeen() }));

export function markChangelogSeen() {
  const latest = CHANGELOG[0]?.date;
  if (!latest) return;
  try { localStorage.setItem(SEEN_KEY, latest); } catch { /* 保存できない環境では今回だけ既読にする */ }
  useChangelog.setState({ seen: latest });
}
