import type { AdProfile, StorageLike } from './user.mjs';
import { ensureDefaultProfile, listProfiles, readProgressSelection } from './user.mjs';

const LINK_KEY = 'ad:v2:tonariumLinks';

type LinkMap = Record<string, string>;

function readLinks(storage: StorageLike): LinkMap {
  try {
    const raw = storage.getItem(LINK_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

// Tonarium の id はクライアント申告で認証ではないため、紐付けキーにしか使わない
export function linkTonariumProfile(
  storage: StorageLike,
  tonariumId: string,
  tonariumName: string,
): AdProfile {
  if (!tonariumId) throw new Error('linkTonariumProfile: tonariumId is required');
  if (readProgressSelection(storage)?.confirmed) return ensureDefaultProfile(storage);
  const links = readLinks(storage);
  const linkedId = links[tonariumId];
  if (linkedId) {
    const found = listProfiles(storage).find((p) => p.id === linkedId);
    if (found) return found;
  }
  const profile = ensureDefaultProfile(storage);
  links[tonariumId] = profile.id;
  storage.setItem(LINK_KEY, JSON.stringify(links));
  return profile;
}

export function linkedProfileId(storage: StorageLike, tonariumId: string): string | null {
  return readLinks(storage)[tonariumId] ?? null;
}
