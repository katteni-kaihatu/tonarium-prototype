// 公開通信には接続しない。子プロセスの試験だけが時刻・乱数・計測を制御する。
export function battlefieldClock() {
  const testing = process.env.NODE_ENV === 'test' && !!process.send;
  let time = testing && process.env.BATTLEFIELD_TEST_CLOCK === '1' ? 10000 : null;
  let seed = 123456789;
  return {
    testing,
    now: () => time ?? Date.now(),
    advance: (ms: number) => { if (time !== null && Number.isFinite(ms) && ms >= 0 && ms <= 60000) time += ms; },
    random: () => {
      if (!testing) return Math.random();
      seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
      return (seed >>> 0) / 0x100000000;
    },
  };
}
