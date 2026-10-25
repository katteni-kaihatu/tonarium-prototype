/** イベント剪定まわりの純粋関数。index.ts の home.events に対する判定を単体テストできるよう切り出した */

/** 開始からこの期間以上過ぎたイベントは残さない (30日) */
export const EVENT_KEEP_MS = 30 * 24 * 60 * 60 * 1000;

/** 剪定対象かどうか。ちょうど保持期間ぶん過ぎたものはまだ残し、それより古いものだけを対象にする。
 * 開始時刻が数値として読めない (NaN・Infinity) ものは安全側で残す */
export const isStaleEvent = (at: number, now: number) => Number.isFinite(at) && at < now - EVENT_KEEP_MS;

/** 剪定後のイベント一覧を返す。入力配列は変更せず、残すものの順序も保つ */
export const pruneEvents = <T extends { at: number }>(events: readonly T[], now: number): T[] =>
  events.filter((ev) => !isStaleEvent(ev.at, now));
