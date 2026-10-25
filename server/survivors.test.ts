import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { clearSurvivor, sendMove, setMoveSendClock, survivorOf, type MoveSendClock, type SurvivorDeps } from './survivors.ts';
import { newSurvivorProfile, newSurvivorState, type SurvivorState } from '../shared/survivor.ts';

/** 時刻とタイマーを手で進めるフェイク。間引きの検証は実時計だと境界がぶれるため差し替える */
class FakeClock implements MoveSendClock {
  t = 0;
  private timers = new Map<number, { at: number; fn: () => void }>();
  private seq = 0;
  now() { return this.t; }
  setTimer(fn: () => void, ms: number) {
    const id = ++this.seq;
    this.timers.set(id, { at: this.t + ms, fn });
    return id as unknown as ReturnType<typeof setTimeout>;
  }
  clearTimer(timer: ReturnType<typeof setTimeout>) { this.timers.delete(timer as unknown as number); }
  advance(ms: number) {
    const end = this.t + ms;
    for (;;) {
      const next = [...this.timers.entries()].filter(([, x]) => x.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      this.timers.delete(next[0]);
      this.t = next[1].at;
      next[1].fn();
    }
    this.t = end;
  }
  get pending() { return this.timers.size; }
}

const clock = new FakeClock();
setMoveSendClock(clock);

function deps(sent: SurvivorState[]): SurvivorDeps {
  return {
    sendState: (_sid, state) => { sent.push(state); },
    profile: () => newSurvivorProfile(),
    saveProfiles: () => {},
    users: () => [],
    avatars: () => new Map(),
    profileUpdated: () => {},
  };
}

const usedSids: string[] = [];
function setup(sid: string) {
  usedSids.push(sid);
  // 開始時刻は 0 から十分離す (新規レコードの最終送信時刻 0 = 「まだ送っていない」が効くように)
  clock.t = 10_000;
  const sent: SurvivorState[] = [];
  return { s: survivorOf(sid), sent, d: deps(sent) };
}

afterEach(() => {
  for (const sid of usedSids.splice(0)) clearSurvivor(sid);
});

test('移動20回が送信2回に間引かれ、最後の状態が末尾で届く', () => {
  const sid = 'throttle-basic';
  const { s, sent, d } = setup(sid);
  // t=0 の初回は即時送信。以後 5ms ごとの移動は間引き間隔 (100ms) の中では送らない
  sendMove(sid, s, d);
  assert.equal(sent.length, 1);
  for (let i = 0; i < 19; i++) {
    clock.advance(5);
    sendMove(sid, s, d);
    assert.equal(sent.length, 1, `t=${clock.t} ではまだ送らない`);
  }
  // 間引き間隔が開けたら、末尾タイマーが最新の状態を1回だけ送る
  clock.advance(200);
  assert.equal(sent.length, 2);
  assert.equal(sent[1], s);
  assert.equal(clock.pending, 0);
});

test('状態が入れ替わっていたら末尾送信せず、間引き時刻も進まない', () => {
  const sid = 'throttle-replaced';
  const { s, sent, d } = setup(sid);
  const other = newSurvivorState(); // states に登録されていない = 入れ替わった先の状態ではない側
  sendMove(sid, s, d); // t=0 即時送信、最終送信時刻は 0
  assert.equal(sent.length, 1);
  clock.advance(50);
  sendMove(sid, other, d); // 末尾タイマー予約 (t=100)
  clock.advance(50); // t=100: 登録中の状態と違うので送らない
  assert.equal(sent.length, 1);
  // 最終送信時刻が t=100 に進んでいたら、次の送信は t=200 まで遅れる。
  // 進んでいないこと (元の t=0 基準で間隔が開いていること) を即時送信で確かめる
  clock.advance(1);
  sendMove(sid, s, d);
  assert.equal(sent.length, 2, 'スキップで時刻が進んでいれば、ここは間引かれて送られない');
});

test('clearSurvivor の後は保留中の末尾タイマーが発火しない', () => {
  const sid = 'throttle-cleared';
  const { s, sent, d } = setup(sid);
  sendMove(sid, s, d);
  assert.equal(sent.length, 1);
  clock.advance(10);
  sendMove(sid, s, d); // 末尾タイマー予約
  assert.equal(clock.pending, 1);
  clearSurvivor(sid);
  assert.equal(clock.pending, 0);
  clock.advance(500);
  assert.equal(sent.length, 1);
});
