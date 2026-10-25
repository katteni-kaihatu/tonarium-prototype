export interface AdProfile { id: string; name: string; createdAt: string | null }
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
export interface AuthProvider {
  mode: string;
  getUserId(): string | null;
  getAuthHeaders(): Record<string, string>;
}
export interface ExportBundle {
  type: string;
  version: number;
  exportedAt: string;
  user: AdProfile;
  save: Record<string, unknown>;
}
export const PROFILES_KEY: string;
export const ACTIVE_PROFILE_KEY: string;
export const SAVE_KEY_PREFIX: string;
export const EXPORT_BUNDLE_TYPE: string;
export const EXPORT_BUNDLE_VERSION: number;
export const DEFAULT_PROFILE_NAME: string;
export const MAX_PROFILE_NAME_LENGTH: number;
export function generateUserId(): string;
export function saveKeyFor(userId: string): string;
export function listProfiles(storage: StorageLike): AdProfile[];
export function createProfile(storage: StorageLike, name: string): AdProfile;
export function getActiveProfile(storage: StorageLike): AdProfile | null;
export function ensureDefaultProfile(storage: StorageLike): AdProfile;
export function switchProfile(storage: StorageLike, userId: string): AdProfile;
export function renameProfile(storage: StorageLike, userId: string, name: string): AdProfile;
export function deleteProfile(storage: StorageLike, userId: string): void;
export function writeSave(storage: StorageLike, userId: string, save: string | Record<string, unknown>): string;
export function readSaveRaw(storage: StorageLike, userId: string): string | null;
export function readSave(storage: StorageLike, userId: string): Record<string, unknown> | null;
export function createAuthProvider(config?: {
  mode?: string;
  storage?: StorageLike | null;
  userId?: string;
  profile?: AdProfile;
  getUserId?: () => string | null;
  token?: string;
}): AuthProvider;
export function buildExportBundle(
  profile: AdProfile,
  saveObject: Record<string, unknown>,
  exportedAt?: string | number | Date,
): ExportBundle;
export function parseImportBundle(jsonTextOrObject: string | Record<string, unknown>): ExportBundle;
export interface ImportResult { profile: AdProfile; userId: string; saveKey: string; sourceUser: AdProfile }
export function importBundleInto(storage: StorageLike, bundle: ExportBundle): ImportResult;
