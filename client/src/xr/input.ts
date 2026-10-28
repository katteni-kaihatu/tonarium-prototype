export interface TurnSettings { mode: 'snap' | 'smooth'; speed: number; angle: number; restrictMovementWhileAiming: boolean }
export const DEFAULT_TURN: TurnSettings = { mode: 'snap', speed: 90, angle: 30, restrictMovementWhileAiming: true };
export function turnSettings(value: unknown): TurnSettings {
  const v = value as Partial<TurnSettings> | null;
  const bounded = (n: unknown, min: number, max: number, fallback: number) => typeof n === 'number' && Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
  return { mode: v?.mode === 'smooth' ? 'smooth' : 'snap', speed: bounded(v?.speed, 15, 180, 90), angle: bounded(v?.angle, 15, 90, 30), restrictMovementWhileAiming: v?.restrictMovementWhileAiming !== false };
}
export function panelDistance(distance: number, axis: number, dt: number) {
  if (![distance, axis, dt].every(Number.isFinite) || dt <= 0 || Math.abs(axis) <= .2) return distance;
  return Math.max(.25, Math.min(3, distance - axis * Math.min(dt, .1) * .8));
}
export function panelScale(distance: number, baseline: number, scale: number) {
  if (![distance, baseline, scale].every(Number.isFinite) || baseline < .03 || distance < 0) return scale;
  return Math.max(.25, Math.min(3, scale * distance / baseline));
}
export function movementAllowed(holding: boolean, aiming: boolean, selecting: boolean, settings: TurnSettings) {
  return !holding && (!settings.restrictMovementWhileAiming || (!aiming && !selecting));
}
export function stick(axes: readonly number[]): [number, number] {
  const offset = axes.length >= 4 ? 2 : 0;
  const axis = (n: number | undefined) => Number.isFinite(n) && Math.abs(n!) > .2 ? Math.max(-1, Math.min(1, n!)) : 0;
  return [axis(axes[offset]), axis(axes[offset + 1])];
}
export function turnStep(axis: number, dt: number, settings: TurnSettings, latched: boolean) {
  if (!Number.isFinite(axis) || !Number.isFinite(dt) || dt <= 0) return { radians: 0, latched: false };
  if (Math.abs(axis) < .25) return { radians: 0, latched: false };
  if (settings.mode === 'smooth') return { radians: -axis * settings.speed * Math.PI / 180 * Math.max(0, Math.min(dt, .1)), latched: false };
  if (Math.abs(axis) < .65 || latched) return { radians: 0, latched };
  return { radians: -Math.sign(axis) * settings.angle * Math.PI / 180, latched: true };
}
export function replaceSelection(value: string, start: number, end: number, text: string, maxLength = -1) {
  const room = maxLength < 0 ? Infinity : Math.max(0, maxLength - (value.length - (end - start)));
  const inserted = Array.from(text).reduce((s, c) => s.length + c.length <= room ? s + c : s, '');
  return { value: value.slice(0, start) + inserted + value.slice(end), cursor: start + inserted.length };
}
export function unicodeCharacter(hex: string): string {
  if (!/^[0-9a-f]{1,6}$/i.test(hex)) return '';
  const n = parseInt(hex, 16);
  return n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : '';
}
