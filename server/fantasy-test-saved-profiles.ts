import fs from 'node:fs';
import type { FantasyProfile } from '../shared/fantasy.ts';
export function readFantasySavedProfiles(file: string): Record<string, FantasyProfile> {
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  return value.version === 2 ? value.profiles : value;
}
